import * as vscode from 'vscode';
import { TaskDockCommandRegistry } from './ui/commands/command-registry.js';
import { UiEventBus } from './ui/events/ui-event-bus.js';
import { ExtensionStateStore } from './ui/state/extension-state-store.js';
import { INITIAL_MIGRATION_V1_SQL } from './infra/sqlite/migrations/initial-migration-v1.js';
import { MIGRATION_V2_SQL } from './infra/sqlite/migrations/initial-migration-v2.js';
import { MIGRATION_V3_SQL } from './infra/sqlite/migrations/initial-migration-v3.js';
import type { MigrationDependencies } from './infra/sqlite/migrations/migrator.js';
import { Migrator } from './infra/sqlite/migrations/migrator.js';
import { BetterSqlite3Client } from './infra/sqlite/better-sqlite3-client.js';
import { AppContainer } from './core/di/container.js';
import { UlidIdGenerator } from './infra/services/ulid-id-generator.js';
import { AuditLogRepository } from './infra/sqlite/repositories/audit-log-repository.js';
import { CommentRepository } from './infra/sqlite/repositories/comment-repository.js';
import { DatabaseProfileRepository } from './infra/sqlite/repositories/database-profile-repository.js';
import { FeatureFlagRepository } from './infra/sqlite/repositories/feature-flag-repository.js';
import { TaskRepository } from './infra/sqlite/repositories/task-repository.js';
import { ConnectorSettingsRepository } from './infra/sqlite/repositories/connector-settings-repository.js';
import { TransactionManager } from './infra/sqlite/tx/transaction-manager.js';
import type { TaskTreeItem } from './ui/tree/task-tree-view-provider.js';
import { MyRecentTasksProvider } from './ui/tree/my-recent-tasks-provider.js';
import { AllProjectsProvider } from './ui/tree/all-projects-provider.js';
import { StatusBarController } from './ui/status/status-bar-controller.js';
import { BoardWebviewPanel } from './ui/webview/board-webview-panel.js';
import { TaskTableWebviewPanel } from './ui/webview/task-table-webview-panel.js';
import { TaskDetailWebviewPanel } from './ui/webview/task-detail-webview-panel.js';
import { ERROR_CODES } from './core/errors/error-codes.js';
import type { Priority, TaskStatus } from './core/domain/entities/task.js';
import { AiTaskCreator } from './infra/services/ai-task-creator.js';
import { NodeOsFileAccessChecker } from './infra/node/node-os-file-access-checker.js';
import { VscodeSecretStorageService } from './infra/vscode/vscode-secret-storage-service.js';
import { ActiveClientHolder } from './infra/sqlite/active-client-holder.js';
import { MultiDbReadManager } from './infra/sqlite/multi-db-read-manager.js';
import path from 'node:path';

type BootstrapMigrationDependencies = {
  ensureDirectory: (dirPath: string) => Promise<void>;
  resolveDatabasePath: (storagePath: string) => string;
  createClient: (databasePath: string) => MigrationDependencies['client'] & { close: () => void };
  createMigrator: (dependencies: MigrationDependencies) => Pick<Migrator, 'migrate'>;
};

const defaultBootstrapMigrationDependencies: BootstrapMigrationDependencies = {
  ensureDirectory: async (dirPath: string) => {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
  },
  resolveDatabasePath: (storagePath: string) => vscode.Uri.joinPath(vscode.Uri.file(storagePath), 'taskdock.sqlite3').fsPath,
  createClient: (databasePath: string) => new BetterSqlite3Client(databasePath),
  createMigrator: (dependencies: MigrationDependencies) => new Migrator(dependencies)
};

function toUserFacingMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.values(ERROR_CODES).find(value => message.includes(value));
  const mapping: Record<string, string> = {
    [ERROR_CODES.AUTH_FAILED]: '認証に失敗しました。アクセスキーを確認してください。',
    [ERROR_CODES.KEY_EXPIRED]: 'アクセスキーの有効期限が切れています。再発行してください。',
    [ERROR_CODES.PERMISSION_DENIED]: 'この操作を実行する権限がありません。',
    [ERROR_CODES.READ_ONLY_MODE]: '現在は読み取り専用モードのため、更新できません。',
    [ERROR_CODES.VALIDATION_FAILED]: '入力内容が不正です。タイトルやカテゴリIDを確認してください。',
    [ERROR_CODES.FILE_NOT_FOUND]: 'DBファイルが見つかりません。パスを確認してください。',
    [ERROR_CODES.ACCESS_DENIED]: 'DBファイルへのアクセスが拒否されました。ファイル権限を確認してください。',
    [ERROR_CODES.FORBIDDEN]: 'この操作には管理者権限が必要です。',
    [ERROR_CODES.TASK_CONFLICT]: 'タスクが他の更新と競合しました。再読み込みして再実行してください。',
    [ERROR_CODES.DB_LOCK_UNSAFE]: 'データベースが安全に利用できない状態です。接続を確認してください。',
    [ERROR_CODES.DB_CORRUPT]: 'データベース破損の可能性があります。バックアップからの復元を検討してください。'
  };
  return (code && mapping[code]) ?? `タスク処理中にエラーが発生しました: ${message}`;
}

export async function bootstrapMigrations(
  context: Pick<vscode.ExtensionContext, 'globalStorageUri' | 'subscriptions'>,
  dependencies: BootstrapMigrationDependencies = defaultBootstrapMigrationDependencies
): Promise<void> {
  const storagePath = context.globalStorageUri.fsPath;
  await dependencies.ensureDirectory(storagePath);

  const databasePath = dependencies.resolveDatabasePath(storagePath);
  const client = dependencies.createClient(databasePath);
  const migrator = dependencies.createMigrator({
    client,
    snapshot: async () => undefined,
    restoreSnapshot: async () => undefined,
    reconnectReadOnly: async () => undefined,
    appendMigrationFailedAudit: async () => undefined
  });

  await migrator.migrate([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }, { version: 2, statements: MIGRATION_V2_SQL }, { version: 3, statements: MIGRATION_V3_SQL }]);
  context.subscriptions.push({ dispose: () => client.close() });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await bootstrapMigrations(context);

  const databasePath = vscode.Uri.joinPath(context.globalStorageUri, 'taskdock.sqlite3').fsPath;
  const homeClient = new BetterSqlite3Client(databasePath);
  const activeClientHolder = new ActiveClientHolder(homeClient);
  context.subscriptions.push({ dispose: () => homeClient.close() });

  const idGenerator = new UlidIdGenerator();
  const seedNow = new Date().toISOString();
  await homeClient.run(
    `INSERT OR IGNORE INTO users(user_id, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['system', 'System', 'admin', 'active', seedNow, seedNow]
  );

  const eventBus = new UiEventBus();
  const secretStorageService = new VscodeSecretStorageService(context.secrets);

  const databaseProfileRepository = new DatabaseProfileRepository(homeClient);
  const osFileAccessChecker = new NodeOsFileAccessChecker();
  const initializeDbClient = async (client: BetterSqlite3Client): Promise<void> => {
    const migrator = new Migrator({
      client,
      snapshot: async () => undefined,
      restoreSnapshot: async () => undefined,
      reconnectReadOnly: async () => undefined,
      appendMigrationFailedAudit: async () => undefined
    });
    await migrator.migrate([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }, { version: 2, statements: MIGRATION_V2_SQL }, { version: 3, statements: MIGRATION_V3_SQL }]);
    const now = new Date().toISOString();
    await client.run(
      `INSERT OR IGNORE INTO users(user_id, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ['system', 'System', 'admin', 'active', now, now]
    );
  };
  const multiDbReadManager = new MultiDbReadManager(databaseProfileRepository, osFileAccessChecker, initializeDbClient);
  await multiDbReadManager.refresh();
  context.subscriptions.push({ dispose: () => multiDbReadManager.closeAll() });
  const appContainer = new AppContainer({
    taskRepository: new TaskRepository(activeClientHolder),
    commentRepository: new CommentRepository(activeClientHolder),
    auditLogRepository: new AuditLogRepository(activeClientHolder),
    transactionManager: new TransactionManager(activeClientHolder),
    idGenerator,
    databaseProfileRepository: databaseProfileRepository,
    authStateReader: { isAuthenticated: () => true },
    connectionHealthChecker: { check: async () => 'healthy' },
    osFileAccessChecker,
    secretStorageService,
    uiEventBus: eventBus,
    featureFlagRepository: new FeatureFlagRepository(activeClientHolder),
    backupSnapshotFactory: { createSnapshot: async () => ({ storagePath: '', checksum: '', sizeBytes: 0 }) },
    backupSnapshotRepository: {
      create: async () => ({ snapshotId: '' }),
      rotate: async () => ({ removedSnapshotIds: [] }),
      findById: async () => null
    },
    snapshotIntegrityVerifier: { verify: async () => true },
    backupRestoreOperator: {
      previewDiff: async () => ({ changedTables: [], changedRows: 0 }),
      backupCurrent: async () => ({ backupSnapshotId: '' }),
      restore: async () => undefined,
      verifyConnection: async () => true
    }
  });
  const useCases = appContainer.buildUseCases();
  const connectorSettingsRepository = new ConnectorSettingsRepository(homeClient);
  const aiTaskCreator = new AiTaskCreator();

  await useCases.scanDatabaseDirectoryUseCase.execute();

  const stateStore = new ExtensionStateStore();
  const userId = vscode.workspace.getConfiguration('taskDock').get<string>('userId', 'system');
  const myRecentTasksProvider = new MyRecentTasksProvider(appContainer.buildProjectTaskLoader(), userId);
  const allProjectsProvider = new AllProjectsProvider(appContainer.buildProjectTaskLoader(), multiDbReadManager);
  const statusBarController = new StatusBarController(stateStore);
  const commandRegistry = new TaskDockCommandRegistry(
    useCases.createTaskUseCase,
    useCases.switchDatabaseProfileUseCase,
    useCases.setReadOnlyModeUseCase,
    activeClientHolder,
    path => {
      const nextClient = new BetterSqlite3Client(path);
      context.subscriptions.push({ dispose: () => nextClient.close() });
      return nextClient;
    },
    stateStore,
    eventBus
  );
  let currentBoardProjectId: string | undefined;
  let currentBoardProfileId: string | undefined;
  const boardPanel = new BoardWebviewPanel(
    {
      execute: (input) => withProfileClient(currentBoardProfileId, () => useCases.moveTaskStatusUseCase.execute(input))
    },
    eventBus,
    async (command, args) => {
      if ((command === 'taskDock.openTaskDetail' || command === 'taskDock.createTask') && currentBoardProfileId) {
        return vscode.commands.executeCommand(command, { ...(args as Record<string, unknown>), profileId: currentBoardProfileId });
      }
      return vscode.commands.executeCommand(command, args);
    }
  );
  const projectTaskLoader = appContainer.buildProjectTaskLoader();
  type BoardTask = {
    taskId: string;
    projectId: string;
    title: string;
    status: TaskStatus;
    priority: Priority;
    description: string | null;
    assignee: string | null;
    dueDate: string | null;
    tags: string[];
    parentTaskId: string | null;
    version: number;
    hasChildren: boolean;
  };

  const fetchBoardTasks = async (projectId?: string) => {
    const collectSubtasks = async (
      parentTaskId: string,
      projectIdOfTask: string
    ): Promise<BoardTask[]> => {
      const subtasks = await projectTaskLoader.listSubtasksByParent(parentTaskId);
      const result: BoardTask[] = [];
      for (const sub of subtasks) {
        const detail = await taskOperator.findDetailById(sub.taskId);
        result.push({
          taskId: sub.taskId,
          projectId: projectIdOfTask,
          title: sub.title,
          status: sub.status,
          priority: sub.priority,
          description: detail?.description ?? null,
          assignee: detail?.assignee ?? null,
          dueDate: detail?.dueDate ?? null,
          tags: detail?.tags ?? [],
          parentTaskId: detail?.parentTaskId ?? parentTaskId,
          version: detail?.version ?? 1,
          hasChildren: sub.hasChildren
        });
        if (sub.hasChildren) {
          result.push(...(await collectSubtasks(sub.taskId, projectIdOfTask)));
        }
      }
      return result;
    };

    const projects = await projectTaskLoader.listProjects();
    const targetProjects = projectId ? projects.filter(project => project.projectId === projectId) : projects;
    return (
      await Promise.all(targetProjects.map(async project => {
        const tasks = await projectTaskLoader.listTasksByProject({ projectId: project.projectId, offset: 0, limit: 100 });
        return Promise.all(tasks.map(async task => {
          const detail = await taskOperator.findDetailById(task.taskId);
          const root = {
            taskId: task.taskId,
            projectId: project.projectId,
            title: task.title,
            status: task.status,
            priority: task.priority,
            description: detail?.description ?? null,
            assignee: detail?.assignee ?? null,
            dueDate: detail?.dueDate ?? null,
            tags: detail?.tags ?? [],
            parentTaskId: detail?.parentTaskId ?? null,
            version: task.version,
            hasChildren: task.hasChildren
          };
          if (task.hasChildren) {
            const children = await collectSubtasks(task.taskId, project.projectId);
            return [root, ...children];
          }
          return [root];
        })).then(groups => groups.flat());
      }))
    ).flat();
  };
  const taskOperator = appContainer.buildTaskOperator();
  const withProfileClient = async <T>(profileId: string | undefined, fn: () => Promise<T>): Promise<T> => {
    const targetClient = profileId ? multiDbReadManager.getClient(profileId) : undefined;
    const currentClient = activeClientHolder.get();
    if (targetClient && targetClient !== currentClient) {
      activeClientHolder.switch(targetClient);
    }
    try {
      return await fn();
    } finally {
      if (targetClient && targetClient !== currentClient && activeClientHolder.get() === targetClient) {
        activeClientHolder.switch(currentClient);
      }
    }
  };
  const tableLoader = appContainer.buildTaskTreeLoader();
  let boardWebviewPanel: vscode.WebviewPanel | undefined;
  const createTablePanel = (profileId?: string): TaskTableWebviewPanel => new TaskTableWebviewPanel(
    { execute: (input) => withProfileClient(profileId, () => useCases.moveTaskStatusUseCase.execute(input)) },
    { execute: (input) => withProfileClient(profileId, () => useCases.updateTaskUseCase.execute(input)) },
    async () => withProfileClient(profileId, async () => {
      const projects = await tableLoader.listProjects();
      const roots = await Promise.all(projects.map(async (project) => {
        const nodes = await tableLoader.listTasksWithDetail(project.projectId);
        return nodes.map(node => ({ ...node, projectId: project.projectId }));
      }));
      return roots.flat();
    }),
    (taskId) => withProfileClient(profileId, () => taskOperator.findDetailById(taskId)),
    async (taskId) => {
      await vscode.commands.executeCommand('taskDock.openTaskDetail', { kind: 'task', id: taskId, label: taskId, hasChildren: false, profileId });
    }
  );
  const commands = commandRegistry.register();
  const switchActiveDatabaseProfile = async (profileId: string) => {
    const output = await commands['taskDock.selectDatabase']({ profileId });
    stateStore.patch({ activeProfileName: output.profileSummary.name });
    return output;
  };
  const dbStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const modeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  const healthStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);

  const refreshStatusBar = (): void => {
    const snapshot = statusBarController.snapshot();
    dbStatusBarItem.text = snapshot.db;
    dbStatusBarItem.command = 'taskDock.selectDatabase';

    modeStatusBarItem.text = snapshot.mode;
    modeStatusBarItem.command = 'taskDock.toggleReadOnly';

    healthStatusBarItem.text = snapshot.health;
    healthStatusBarItem.command = snapshot.reconnectCommand ?? undefined;
  };

  refreshStatusBar();
  dbStatusBarItem.show();
  modeStatusBarItem.show();
  healthStatusBarItem.show();

  const disposeProfileSwitched = eventBus.subscribe('PROFILE_SWITCHED', refreshStatusBar);
  const disposeDatabaseDirectoryUpdated = eventBus.subscribe('DATABASE_DIRECTORY_UPDATED', refreshStatusBar);
  const disposeModeChanged = eventBus.subscribe('MODE_CHANGED', refreshStatusBar);
  const disposeHealthChanged = eventBus.subscribe('CONNECTION_HEALTH_CHANGED', refreshStatusBar);
  const disposeProfileSwitchedReload = eventBus.subscribe('PROFILE_SWITCHED', async () => {
    await multiDbReadManager.refresh();
    myRecentTasksProvider.refresh();
    allProjectsProvider.refresh();
    if (boardWebviewPanel) {
      const boardTasks = await withProfileClient(currentBoardProfileId, () => fetchBoardTasks(currentBoardProjectId));
      boardPanel.render(boardWebviewPanel, boardTasks);
    }
  });

  const disposeDatabaseDirectoryReload = eventBus.subscribe('DATABASE_DIRECTORY_UPDATED', async () => {
    await multiDbReadManager.refresh();
    allProjectsProvider.refresh();
  });

  const disposeTaskUpdated = eventBus.subscribe('TASK_UPDATED', async () => {
    myRecentTasksProvider.refresh();
    allProjectsProvider.refresh();
    if (boardWebviewPanel) {
      try {
        const boardTasks = await withProfileClient(currentBoardProfileId, () => fetchBoardTasks(currentBoardProjectId));
        boardPanel.render(boardWebviewPanel, boardTasks);
      } catch (error) {
        void vscode.window.showErrorMessage(toUserFacingMessage(error));
      }
    }
  });
  const myRecentTasksChangeEmitter = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
  const disposeMyRecentTasksRefresh = myRecentTasksProvider.onRefresh(() => myRecentTasksChangeEmitter.fire());
  const allProjectsChangeEmitter = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
  const disposeAllProjectsRefresh = allProjectsProvider.onRefresh(() => allProjectsChangeEmitter.fire());
  const myRecentTasksTreeView = vscode.window.createTreeView<TaskTreeItem>('taskDock.myRecentTasks', {
    treeDataProvider: {
      onDidChangeTreeData: myRecentTasksChangeEmitter.event,
      getChildren: async (element?: TaskTreeItem) => myRecentTasksProvider.getChildren(element),
      getTreeItem: (element: TaskTreeItem) => {
        const collapsibleState = element.hasChildren
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
        const treeItem = new vscode.TreeItem(element.label, collapsibleState);
        if (element.kind === 'database') {
          treeItem.iconPath = element.available
            ? new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'))
            : new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.gray'));
          treeItem.description = element.available ? undefined : '(接続不可)';
          treeItem.collapsibleState = element.available
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
          treeItem.contextValue = 'database';
        }
        if (element.status) {
          treeItem.description = `[${element.status}]`;
          const iconByPriority: Record<string, vscode.ThemeIcon> = {
            low: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.gray')),
            medium: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue')),
            high: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow')),
            critical: new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.red'))
          };
          const iconByStatus: Record<string, vscode.ThemeIcon> = {
            todo: new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray')),
            in_progress: new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.blue')),
            done: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
            blocked: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'))
          };
          treeItem.iconPath = iconByStatus[element.status] ?? (element.priority && iconByPriority[element.priority]) ?? new vscode.ThemeIcon('circle-outline');
        }
        if (element.kind === 'task' || element.kind === 'subtask') {
          treeItem.command = { command: 'taskDock.openTaskDetail', title: 'Open Task Detail', arguments: [element] };
          treeItem.contextValue = element.kind;
        }
        return treeItem;
      }
    }
  });
  const allProjectsTreeView = vscode.window.createTreeView<TaskTreeItem>('taskDock.allProjects', {
    treeDataProvider: {
      onDidChangeTreeData: allProjectsChangeEmitter.event,
      getChildren: async (element?: TaskTreeItem) => allProjectsProvider.getChildren(element),
      getTreeItem: (element: TaskTreeItem) => {
        const collapsibleState = element.hasChildren
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
        const treeItem = new vscode.TreeItem(element.label, collapsibleState);
        if (element.kind === 'database') {
          treeItem.iconPath = element.available
            ? new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'))
            : new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.gray'));
          treeItem.description = element.available ? undefined : '(接続不可)';
          treeItem.collapsibleState = element.available
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
          treeItem.contextValue = 'database';
          if (element.available) {
            treeItem.command = { command: 'taskDock.openDbTable', title: 'Open Table', arguments: [element] };
          }
        }
        if (element.status) {
          treeItem.description = `[${element.status}]`;
          const iconByPriority: Record<string, vscode.ThemeIcon> = {
            low: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.gray')),
            medium: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue')),
            high: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow')),
            critical: new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.red'))
          };
          const iconByStatus: Record<string, vscode.ThemeIcon> = {
            todo: new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray')),
            in_progress: new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.blue')),
            done: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
            blocked: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'))
          };
          treeItem.iconPath = iconByStatus[element.status] ?? (element.priority && iconByPriority[element.priority]) ?? new vscode.ThemeIcon('circle-outline');
        }
        if (element.kind === 'project') {
          treeItem.command = { command: 'taskDock.openBoard', title: 'Open Board', arguments: [{ projectId: element.id, profileId: element.profileId }] };
          treeItem.tooltip = `カテゴリ: ${element.label}`;
          treeItem.description = element.projectId && element.projectId !== element.label ? element.projectId : treeItem.description;
          treeItem.contextValue = element.kind;
        }
        if (element.kind === 'task' || element.kind === 'subtask') {
          treeItem.command = { command: 'taskDock.openTaskDetail', title: 'Open Task Detail', arguments: [element] };
          treeItem.contextValue = element.kind;
        }
        return treeItem;
      }
    }
  });
  const resolveSelectedItem = (item?: TaskTreeItem): TaskTreeItem | undefined =>
    item ?? myRecentTasksTreeView.selection[0] ?? allProjectsTreeView.selection[0];
  void vscode.commands.executeCommand('setContext', 'taskDock.showDone', allProjectsProvider.isShowingDone());

  context.subscriptions.push(
    dbStatusBarItem,
    modeStatusBarItem,
    healthStatusBarItem,
    { dispose: disposeProfileSwitched },
    { dispose: disposeDatabaseDirectoryUpdated },
    { dispose: disposeModeChanged },
    { dispose: disposeHealthChanged },
    { dispose: disposeProfileSwitchedReload },
    { dispose: disposeDatabaseDirectoryReload },
    { dispose: disposeTaskUpdated },
    { dispose: disposeMyRecentTasksRefresh },
    { dispose: disposeAllProjectsRefresh },
    myRecentTasksChangeEmitter,
    allProjectsChangeEmitter,
    myRecentTasksTreeView,
    allProjectsTreeView,
    vscode.commands.registerCommand('taskDock.openTree', async () => {
      await vscode.commands.executeCommand('taskDock.myRecentTasks.focus');
      return commands['taskDock.openTree']();
    }),
    vscode.commands.registerCommand('taskDock.myRecentTasks.sortUpdated', () => myRecentTasksProvider.setSort('updatedAt')),
    vscode.commands.registerCommand('taskDock.myRecentTasks.sortPriority', () => myRecentTasksProvider.setSort('priority')),
    vscode.commands.registerCommand('taskDock.myRecentTasks.sortDeadline', () => myRecentTasksProvider.setSort('dueDate')),
    vscode.commands.registerCommand('taskDock.allProjects.sortUpdated', () => allProjectsProvider.setSort('updatedAt')),
    vscode.commands.registerCommand('taskDock.allProjects.sortPriority', () => allProjectsProvider.setSort('priority')),
    vscode.commands.registerCommand('taskDock.allProjects.sortDeadline', () => allProjectsProvider.setSort('dueDate')),
    vscode.commands.registerCommand('taskDock.allProjects.showDoneOnly', async () => {
      allProjectsProvider.toggleDone();
      await vscode.commands.executeCommand('setContext', 'taskDock.showDone', allProjectsProvider.isShowingDone());
    }),
    vscode.commands.registerCommand('taskDock.allProjects.showActiveOnly', async () => {
      allProjectsProvider.toggleDone();
      await vscode.commands.executeCommand('setContext', 'taskDock.showDone', allProjectsProvider.isShowingDone());
    }),
    vscode.commands.registerCommand('taskDock.openBoard', async (input: { projectId?: string; profileId?: string } = {}) => {
      currentBoardProjectId = input.projectId;
      currentBoardProfileId = input.profileId;
      const boardTasks = await withProfileClient(currentBoardProfileId, () => fetchBoardTasks(currentBoardProjectId));
      if (!boardWebviewPanel) {
        boardWebviewPanel = vscode.window.createWebviewPanel(
          BoardWebviewPanel.VIEW_TYPE,
          'Task Dock Board',
          vscode.ViewColumn.One,
          { enableScripts: true, retainContextWhenHidden: true }
        );
        boardWebviewPanel.onDidChangeViewState(({ webviewPanel }) => {
          if (webviewPanel.active && boardWebviewPanel) {
            void withProfileClient(currentBoardProfileId, () => fetchBoardTasks(currentBoardProjectId))
              .then(tasks => {
                boardPanel.render(boardWebviewPanel!, tasks);
              })
              .catch(error => {
                void vscode.window.showErrorMessage(toUserFacingMessage(error));
              });
          }
        });
        boardWebviewPanel.onDidDispose(() => {
          boardWebviewPanel = undefined;
          currentBoardProfileId = undefined;
        });
      } else {
        boardWebviewPanel.reveal(vscode.ViewColumn.One);
      }

      boardPanel.render(boardWebviewPanel, boardTasks);
      return commands['taskDock.openBoard']();
    }),
    vscode.commands.registerCommand('taskDock.openTable', async () => {
      const webviewPanel = vscode.window.createWebviewPanel(
        TaskTableWebviewPanel.VIEW_TYPE,
        'Task Dock Table',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      await createTablePanel().render(webviewPanel);
      return { viewId: 'taskDock.tableView' as const };
    }),
    vscode.commands.registerCommand('taskDock.openDbTable', async (item?: TaskTreeItem) => {
      if (!item || item.kind !== 'database' || !item.profileId || !item.available) return;
      try {
        const webviewPanel = vscode.window.createWebviewPanel(
          TaskTableWebviewPanel.VIEW_TYPE,
          `Task Dock Table - ${item.label}`,
          vscode.ViewColumn.One,
          { enableScripts: true }
        );
        await createTablePanel(item.profileId).render(webviewPanel);
      } catch (error) {
        void vscode.window.showErrorMessage(toUserFacingMessage(error));
      }
    }),
    vscode.commands.registerCommand('taskDock.selectDatabase', async () => {
      const profiles = await databaseProfileRepository.findAll();
      type DbItem = vscode.QuickPickItem & { profileId?: string; action?: 'mount' | 'directory' | 'create' };
      const unmountButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'このDBをアンマウント' };
      const toProfileItem = (profile: Awaited<ReturnType<typeof databaseProfileRepository.findAll>>[number]): DbItem => ({
        label: profile.name, description: profile.path, detail: `${profile.mode} / ${profile.mountSource}`, profileId: profile.profileId, buttons: [unmountButton]
      });
      const actionItems: DbItem[] = [{ label: '$(new-file) 新しいDBを作成...', action: 'create' }, { label: '$(add) 個別ファイルを追加...', action: 'mount' }, { label: '$(folder) フォルダを追加...', action: 'directory' }];
      const quickPick = vscode.window.createQuickPick<DbItem>();
      quickPick.title = profiles.length === 0 ? '登録済みのDBはありません。ファイルかフォルダを追加してください。' : '切り替えるDBを選択';
      quickPick.items = [...profiles.map(toProfileItem), ...actionItems];
      const picked = await new Promise<DbItem | undefined>(resolve => {
        const d1 = quickPick.onDidAccept(() => { resolve(quickPick.selectedItems[0]); quickPick.hide(); });
        const d2 = quickPick.onDidHide(() => resolve(undefined));
        const d3 = quickPick.onDidTriggerItemButton(async ({ item, button }) => {
          if (button !== unmountButton || !item.profileId) return;
          if (item.profileId === stateStore.getState().activeProfile) return void vscode.window.showErrorMessage('使用中のDBはアンマウントできません');
          try {
            await useCases.unmountDatabaseUseCase.execute({ profileId: item.profileId, actorRole: 'admin' });
            quickPick.items = [...(await databaseProfileRepository.findAll()).map(toProfileItem), ...actionItems];
          } catch (error) { void vscode.window.showErrorMessage(toUserFacingMessage(error)); }
        });
        quickPick.onDidHide(() => { d1.dispose(); d2.dispose(); d3.dispose(); quickPick.dispose(); });
        quickPick.show();
      });
      if (!picked) return undefined;
      if (picked.action === 'create') return vscode.commands.executeCommand('taskDock.createDatabase');
      if (picked.action === 'mount') return vscode.commands.executeCommand('taskDock.mountDatabase');
      if (picked.action === 'directory') return vscode.commands.executeCommand('taskDock.registerDatabaseDirectory');
      if (!picked.profileId) return undefined;
      return switchActiveDatabaseProfile(picked.profileId);
    }),
    vscode.commands.registerCommand('taskDock.createDatabase', async () => {
      const uri = await vscode.window.showSaveDialog({ filters: { 'SQLite Database': ['sqlite3'] }, title: '新しいDBファイルの保存先を選択' });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(uri, new Uint8Array());
      await vscode.commands.executeCommand('taskDock.mountDatabase', uri.fsPath);
    }),
    vscode.commands.registerCommand('taskDock.mountDatabase', async (inputPath?: string) => {
      let dbPath = inputPath;
      if (!dbPath) {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
          filters: { 'SQLite Database': ['sqlite', 'sqlite3', 'db'] }, title: 'マウントする SQLite ファイルを選択'
        });
        if (!uris?.length) return;
        dbPath = uris[0].fsPath;
      }
      const name = await vscode.window.showInputBox({ prompt: 'このDBの表示名を入力してください', value: path.basename(dbPath), ignoreFocusOut: true });
      if (!name) return;
      try {
        await useCases.mountDatabaseUseCase.execute({ path: dbPath, name, mode: 'readWrite', actorRole: 'admin' });
        const mountedClient = new BetterSqlite3Client(dbPath);
        try {
          await initializeDbClient(mountedClient);
        } finally {
          mountedClient.close();
        }
        void vscode.window.showInformationMessage(`DB "${name}" をマウントしました`);
      } catch (error) { void vscode.window.showErrorMessage(toUserFacingMessage(error)); }
    }),
    vscode.commands.registerCommand('taskDock.registerDatabaseDirectory', async () => {
      const uris = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: 'SQLite ファイルを含むフォルダを選択' });
      if (!uris?.length) return;
      try { const out = await useCases.registerDatabaseDirectoryUseCase.execute({ directoryPath: uris[0].fsPath, actorRole: 'admin' }); void vscode.window.showInformationMessage(`${out.registeredProfiles.length} 件の DB を登録しました`); } catch (error) { void vscode.window.showErrorMessage(toUserFacingMessage(error)); }
    }),
    vscode.commands.registerCommand(
      'taskDock.toggleReadOnly',
      async (input: { profileId?: string; enabled?: boolean; actorRole?: 'admin' | 'general' } = {}) =>
        commands['taskDock.toggleReadOnly']({
          profileId: input.profileId ?? stateStore.getState().activeProfile ?? 'default',
          enabled: input.enabled ?? stateStore.getState().connectionMode !== 'readOnly',
          actorRole: input.actorRole ?? 'admin'
        })
    ),
    vscode.commands.registerCommand(
      'taskDock.createTask',
      async (input?: { title?: string; projectId?: string; profileId?: string; parentTaskId?: string | null; status?: 'todo' | 'in_progress' | 'blocked' | 'done'; priority?: 'low' | 'medium' | 'high' | 'critical'; assignee?: string | null; dueDate?: string | null; tags?: string[] }) => {
      const previousClient = activeClientHolder.get();
      try {
        let profileId = input?.profileId;
        if (!profileId) {
          const profiles = multiDbReadManager.getProfiles().filter(profile => profile.available);
          if (profiles.length === 0) {
            void vscode.window.showErrorMessage('DBが登録されていません。まずDBをマウントしてください。');
            return undefined;
          }
          const selectedProfile = await vscode.window.showQuickPick(
            profiles.map(profile => ({
              label: profile.name,
              description: profile.path,
              profileId: profile.profileId
            })),
            { title: 'タスクを作成するDBを選択', ignoreFocusOut: true }
          );
          if (!selectedProfile?.profileId) return undefined;
          profileId = selectedProfile.profileId;
        }
        let projectId = input?.projectId;
        if (!projectId) {
          const repo = multiDbReadManager.getRepo(profileId);
          if (!repo) {
            void vscode.window.showErrorMessage('指定されたDBに接続できません。DB一覧を更新して再試行してください。');
            return undefined;
          }
          const projects = await repo.listProjects();
          if (projects.length > 0) {
            const selectedProject = await vscode.window.showQuickPick(
              [
                ...projects.map(project => ({ label: project.projectName, description: project.projectId, projectId: project.projectId })),
                { label: '$(add) 新しいカテゴリを作成...', projectId: '__new__' }
              ],
              { title: 'カテゴリを選択', ignoreFocusOut: true }
            );
            if (!selectedProject) return undefined;
            if (selectedProject.projectId !== '__new__') {
              projectId = selectedProject.projectId;
            }
          }
          if (!projectId) {
            projectId = await vscode.window.showInputBox({ prompt: 'カテゴリIDを入力してください', ignoreFocusOut: true });
          }
        }
        if (!projectId) {
          return undefined;
        }
        const title = input?.title ?? (await vscode.window.showInputBox({ prompt: 'タスクタイトルを入力してください', ignoreFocusOut: true }));
        if (!title) return undefined;

        const now = new Date().toISOString();
        const currentClient = activeClientHolder.get();
        const targetClient = profileId
          ? multiDbReadManager.getClient(profileId)
          : currentClient;
        if (profileId && !targetClient) {
          void vscode.window.showErrorMessage('指定されたDBに接続できません。DB一覧を更新して再試行してください。');
          return undefined;
        }
        const writeClient = targetClient ?? currentClient;
        await writeClient.run(
          `INSERT OR IGNORE INTO projects(project_id, name, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          [projectId, projectId, 0, now, now]
        );

        if (writeClient !== currentClient) {
          activeClientHolder.switch(writeClient);
        }

        const output = await commands['taskDock.createTask']({
          taskId: idGenerator.nextUlid(),
          projectId,
          title,
          description: null,
          status: input?.status ?? 'todo',
          priority: input?.priority ?? 'medium',
          assignee: input?.assignee ?? null,
          dueDate: input?.dueDate ?? null,
          tags: input?.tags ?? [],
          parentTaskId: input?.parentTaskId ?? null,
          actorId: 'system',
          now
        });

        if (writeClient !== currentClient) {
          activeClientHolder.switch(currentClient);
        }
        eventBus.publish({ type: 'TASK_UPDATED', payload: { taskId: output.id } });
        return output;
      } catch (error) {
        void vscode.window.showErrorMessage(toUserFacingMessage(error));
        return undefined;
      } finally {
        if (activeClientHolder.get() !== previousClient) {
          activeClientHolder.switch(previousClient);
        }
      }
      }
    ),
    vscode.commands.registerCommand('taskDock.createTaskFromAI', async () => {
      try {
        const naturalLanguage = await vscode.window.showInputBox({ prompt: 'AIに作成させるタスク内容を入力してください', ignoreFocusOut: true });
        if (!naturalLanguage) return undefined;
        const projectId = await vscode.window.showInputBox({ prompt: 'カテゴリIDを入力してください', ignoreFocusOut: true });
        if (!projectId) return undefined;

        const settings = await connectorSettingsRepository.findByConnectorAndProfile('ai', stateStore.getState().activeProfile ?? 'default');
        const parsedSettings = settings?.settingsJson ? JSON.parse(settings.settingsJson) as { apiKey?: string; model?: string } : {};
        if (!parsedSettings.apiKey) {
          void vscode.window.showErrorMessage('AI APIキーが未設定です。connector_settings (connector_id=ai) を設定してください。');
          return undefined;
        }

        const draft = await aiTaskCreator.createDraft({ apiKey: parsedSettings.apiKey, model: parsedSettings.model ?? 'claude-3-5-haiku-latest', prompt: naturalLanguage });
        const confirmed = await vscode.window.showInformationMessage(
          `AI提案: ${draft.title} / priority=${draft.priority} / due=${draft.dueDate ?? '-'} / tags=${draft.tags.join(',') || '-'}`,
          { modal: true },
          '作成する'
        );
        if (confirmed !== '作成する') return undefined;
        return vscode.commands.executeCommand('taskDock.createTask', {
          title: draft.title,
          projectId,
          priority: draft.priority,
          dueDate: draft.dueDate,
          tags: draft.tags
        });
      } catch (error) {
        void vscode.window.showErrorMessage(toUserFacingMessage(error));
        return undefined;
      }
    }),

    vscode.commands.registerCommand('taskDock.createSubtask', async (item?: TaskTreeItem) => {
      item = resolveSelectedItem(item);
      if (!item || (item.kind !== 'task' && item.kind !== 'subtask')) return;
      if (!item.projectId) return;
      await vscode.commands.executeCommand('taskDock.createTask', {
        projectId: item.projectId,
        profileId: item.profileId,
        parentTaskId: item.id
      });
    }),
    vscode.commands.registerCommand('taskDock.createTaskInDb', async (item?: TaskTreeItem) => {
      item = resolveSelectedItem(item);
      if (!item || item.kind !== 'database' || !item.profileId) return;
      await vscode.commands.executeCommand('taskDock.createTask', { profileId: item.profileId });
    }),
    vscode.commands.registerCommand('taskDock.createTaskInProject', async (item?: TaskTreeItem) => {
      item = resolveSelectedItem(item);
      if (!item || item.kind !== 'project' || !item.profileId) return;
      await vscode.commands.executeCommand('taskDock.createTask', { profileId: item.profileId, projectId: item.projectId });
    }),
    vscode.commands.registerCommand('taskDock.openTaskDetail', async (item?: TaskTreeItem | { taskId?: string }) => {
      const taskId = item && 'taskId' in item && typeof item.taskId === 'string'
        ? item.taskId
        : (() => {
            const selected = resolveSelectedItem(item as TaskTreeItem | undefined);
            if (!selected || (selected.kind !== 'task' && selected.kind !== 'subtask')) return null;
            return selected.id;
          })();
      if (!taskId) return;
      const profileId = item && 'profileId' in item ? (item as TaskTreeItem).profileId : undefined;
      const run = <T>(fn: () => Promise<T>) => withProfileClient(profileId, fn);
      const panel = vscode.window.createWebviewPanel('taskDock.taskDetail', 'Task Detail', vscode.ViewColumn.Active, { enableScripts: true });
      const detailPanel = new TaskDetailWebviewPanel(
        (id) => run(() => appContainer.buildTaskOperator().findDetailById(id)),
        (parentId) => run(() => appContainer.buildProjectTaskLoader().listSubtasksByParent(parentId)),
        (id) => run(() => useCases.listTaskCommentsUseCase.execute({ taskId: id })),
        { execute: (input) => run(() => useCases.updateTaskUseCase.execute(input)) } as Pick<typeof useCases.updateTaskUseCase, 'execute'>,
        { execute: (input) => run(() => useCases.moveTaskStatusUseCase.execute(input)) } as Pick<typeof useCases.moveTaskStatusUseCase, 'execute'>,
        { execute: (input) => run(() => useCases.addTaskCommentUseCase.execute(input)) } as Pick<typeof useCases.addTaskCommentUseCase, 'execute'>,
        async (cmd, args) => {
          if ((cmd === 'taskDock.createSubtask' || cmd === 'taskDock.openTaskDetail') && profileId) {
            return vscode.commands.executeCommand(cmd, { ...(args as Record<string, unknown>), profileId });
          }
          return vscode.commands.executeCommand(cmd, args);
        }
      );
      await detailPanel.render(panel, taskId);
    }),
    vscode.commands.registerCommand('taskDock.updateTask', async (item?: TaskTreeItem) => {
      item = resolveSelectedItem(item);
      if (!item || (item.kind !== 'task' && item.kind !== 'subtask')) return;
      const detail = await appContainer.buildTaskOperator().findDetailById(item.id);
      if (!detail) return;
      try {
        const title = (await vscode.window.showInputBox({ prompt: '新しいタイトル', value: detail.title, ignoreFocusOut: true })) ?? detail.title;
        const priority = ((await vscode.window.showQuickPick(['low', 'medium', 'high', 'critical'], { title: '優先度を選択', placeHolder: detail.priority })) ??
          detail.priority) as 'low' | 'medium' | 'high' | 'critical';
        const dueDate = await vscode.window.showInputBox({ prompt: '期限日 (YYYY-MM-DD)', value: detail.dueDate ?? '', ignoreFocusOut: true });
        await useCases.updateTaskUseCase.execute({
          taskId: detail.taskId, projectId: detail.projectId, title, description: detail.description, status: detail.status, priority, assignee: detail.assignee,
          dueDate: dueDate && dueDate.trim().length > 0 ? dueDate : null, tags: detail.tags, parentTaskId: detail.parentTaskId, actorId: 'system', now: new Date().toISOString(), expectedVersion: detail.version
        });
        eventBus.publish({ type: 'TASK_UPDATED', payload: { taskId: detail.taskId } });
      } catch (error) { void vscode.window.showErrorMessage(toUserFacingMessage(error)); }
    }),
    vscode.commands.registerCommand('taskDock.deleteTask', async (item?: TaskTreeItem) => {
      item = resolveSelectedItem(item);
      if (!item || (item.kind !== 'task' && item.kind !== 'subtask')) return;
      const confirmed = await vscode.window.showWarningMessage('このタスクを削除しますか？', { modal: true }, '削除');
      if (confirmed !== '削除') return;
      await appContainer.buildTaskOperator().deleteById(item.id);
      eventBus.publish({ type: 'TASK_UPDATED', payload: { taskId: item.id } });
    })
  );
}

export function deactivate(): void {}
