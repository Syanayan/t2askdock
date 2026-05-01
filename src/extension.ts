import * as vscode from 'vscode';
import { TaskDockCommandRegistry } from './ui/commands/command-registry.js';
import { UiEventBus } from './ui/events/ui-event-bus.js';
import { ExtensionStateStore } from './ui/state/extension-state-store.js';
import { INITIAL_MIGRATION_V1_SQL } from './infra/sqlite/migrations/initial-migration-v1.js';
import { MIGRATION_V2_SQL } from './infra/sqlite/migrations/initial-migration-v2.js';
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
import { TransactionManager } from './infra/sqlite/tx/transaction-manager.js';
import type { TaskTreeItem } from './ui/tree/task-tree-view-provider.js';
import { MyRecentTasksProvider } from './ui/tree/my-recent-tasks-provider.js';
import { AllProjectsProvider } from './ui/tree/all-projects-provider.js';
import { StatusBarController } from './ui/status/status-bar-controller.js';
import { BoardWebviewPanel } from './ui/webview/board-webview-panel.js';
import { TaskTableWebviewPanel } from './ui/webview/task-table-webview-panel.js';
import { ERROR_CODES } from './core/errors/error-codes.js';

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
    [ERROR_CODES.VALIDATION_FAILED]: '入力内容が不正です。タイトルやプロジェクトIDを確認してください。',
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

  await migrator.migrate([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }, { version: 2, statements: MIGRATION_V2_SQL }]);
  context.subscriptions.push({ dispose: () => client.close() });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await bootstrapMigrations(context);

  const databasePath = vscode.Uri.joinPath(context.globalStorageUri, 'taskdock.sqlite3').fsPath;
  const client = new BetterSqlite3Client(databasePath);
  context.subscriptions.push({ dispose: () => client.close() });

  const idGenerator = new UlidIdGenerator();
  const seedNow = new Date().toISOString();
  await client.run(
    `INSERT OR IGNORE INTO users(user_id, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['system', 'System', 'admin', 'active', seedNow, seedNow]
  );

  const appContainer = new AppContainer({
    taskRepository: new TaskRepository(client),
    commentRepository: new CommentRepository(client),
    auditLogRepository: new AuditLogRepository(client),
    transactionManager: new TransactionManager(client),
    idGenerator,
    databaseProfileRepository: new DatabaseProfileRepository(client),
    authStateReader: { isAuthenticated: () => true },
    connectionHealthChecker: { check: async () => 'healthy' },
    featureFlagRepository: new FeatureFlagRepository(client),
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

  const eventBus = new UiEventBus();
  const stateStore = new ExtensionStateStore();
  const userId = vscode.workspace.getConfiguration('taskDock').get<string>('userId', 'system');
  const myRecentTasksProvider = new MyRecentTasksProvider(appContainer.buildProjectTaskLoader(), userId);
  const allProjectsProvider = new AllProjectsProvider(appContainer.buildProjectTaskLoader());
  const statusBarController = new StatusBarController(stateStore);
  const commandRegistry = new TaskDockCommandRegistry(
    useCases.createTaskUseCase,
    useCases.switchDatabaseProfileUseCase,
    useCases.setReadOnlyModeUseCase,
    stateStore,
    eventBus
  );
  const boardPanel = new BoardWebviewPanel(
    useCases.moveTaskStatusUseCase,
    eventBus
  );
  const taskOperator = appContainer.buildTaskOperator();
  const tableLoader = appContainer.buildTaskTreeLoader();
  const tablePanel = new TaskTableWebviewPanel(
    useCases.moveTaskStatusUseCase,
    useCases.updateTaskUseCase,
    async () => {
      const projects = await tableLoader.listProjects();
      const roots = await Promise.all(projects.map(async (project) => {
        const nodes = await tableLoader.listTasksWithDetail(project.projectId);
        return nodes.map(node => ({ ...node, projectId: project.projectId }));
      }));
      return roots.flat();
    },
    (taskId) => taskOperator.findDetailById(taskId),
    async (taskId) => {
      await vscode.commands.executeCommand('taskDock.openTaskDetail', { kind: 'task', id: taskId, label: taskId, hasChildren: false });
    }
  );
  const commands = commandRegistry.register();
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
  const disposeModeChanged = eventBus.subscribe('MODE_CHANGED', refreshStatusBar);
  const disposeHealthChanged = eventBus.subscribe('CONNECTION_HEALTH_CHANGED', refreshStatusBar);

  const disposeTaskUpdated = eventBus.subscribe('TASK_UPDATED', () => {
    myRecentTasksProvider.refresh();
    allProjectsProvider.refresh();
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
          treeItem.command = { command: 'taskDock.openBoard', title: 'Open Board', arguments: [{ projectId: element.id }] };
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
    { dispose: disposeModeChanged },
    { dispose: disposeHealthChanged },
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
    vscode.commands.registerCommand('taskDock.allProjects.toggleDone', async () => {
      allProjectsProvider.toggleDone();
      await vscode.commands.executeCommand('setContext', 'taskDock.showDone', allProjectsProvider.isShowingDone());
    }),
    vscode.commands.registerCommand('taskDock.openBoard', async (input: { projectId?: string } = {}) => {
      const projects = await appContainer.buildProjectTaskLoader().listProjects();
      const targetProjects = input.projectId ? projects.filter(project => project.projectId === input.projectId) : projects;
      const loader = appContainer.buildProjectTaskLoader();
      const boardTasks = (
        await Promise.all(targetProjects.map(async project => {
          const tasks = await loader.listTasksByProject({ projectId: project.projectId, offset: 0, limit: 100 });
          return tasks.map(task => ({
            taskId: task.taskId,
            projectId: project.projectId,
            title: task.title,
            status: task.status,
            priority: task.priority,
            description: null,
            assignee: null,
            dueDate: null,
            tags: [],
            parentTaskId: null,
            version: task.version
          }));
        }))
      ).flat();
      const webviewPanel = vscode.window.createWebviewPanel(
        BoardWebviewPanel.VIEW_TYPE,
        'Task Dock Board',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      boardPanel.render(webviewPanel, boardTasks);
      return commands['taskDock.openBoard']();
    }),
    vscode.commands.registerCommand('taskDock.openTable', async () => {
      const webviewPanel = vscode.window.createWebviewPanel(
        TaskTableWebviewPanel.VIEW_TYPE,
        'Task Dock Table',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      await tablePanel.render(webviewPanel);
      return { viewId: 'taskDock.tableView' as const };
    }),
    vscode.commands.registerCommand('taskDock.selectDatabase', async (input: { profileId?: string } = {}) =>
      commands['taskDock.selectDatabase']({ profileId: input.profileId ?? 'default' })
    ),
    vscode.commands.registerCommand(
      'taskDock.toggleReadOnly',
      async (input: { profileId?: string; enabled?: boolean; actorRole?: 'admin' | 'general' } = {}) =>
        commands['taskDock.toggleReadOnly']({
          profileId: input.profileId ?? stateStore.getState().activeProfile ?? 'default',
          enabled: input.enabled ?? stateStore.getState().connectionMode !== 'readOnly',
          actorRole: input.actorRole ?? 'admin'
        })
    ),
    vscode.commands.registerCommand('taskDock.createTask', async (input?: { title?: string; projectId?: string; parentTaskId?: string | null }) => {
      try {
        const title = input?.title ?? (await vscode.window.showInputBox({ prompt: 'タスクタイトルを入力してください', ignoreFocusOut: true }));
        if (!title) {
          return undefined;
        }
        const projectId =
          input?.projectId ?? (await vscode.window.showInputBox({ prompt: 'プロジェクトIDを入力してください', ignoreFocusOut: true }));
        if (!projectId) {
          return undefined;
        }

        const now = new Date().toISOString();
        await client.run(
          `INSERT OR IGNORE INTO projects(project_id, name, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          [projectId, projectId, 0, now, now]
        );
        return commands['taskDock.createTask']({
          taskId: idGenerator.nextUlid(),
          projectId,
          title,
          description: null,
          status: 'todo',
          priority: 'medium',
          assignee: null,
          dueDate: null,
          tags: [],
          parentTaskId: input?.parentTaskId ?? null,
          actorId: 'system',
          now
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
        parentTaskId: item.id
      });
    }),
    vscode.commands.registerCommand('taskDock.openTaskDetail', async (item?: TaskTreeItem) => {
      item = resolveSelectedItem(item);
      if (!item || (item.kind !== 'task' && item.kind !== 'subtask')) return;
      const detail = await appContainer.buildTaskOperator().findDetailById(item.id);
      if (!detail) return;
      const panel = vscode.window.createWebviewPanel('taskDock.taskDetail', `Task: ${detail.title}`, vscode.ViewColumn.Active, { enableScripts: true });
      panel.webview.html = `<html><body><h2>${detail.title}</h2><p>status: ${detail.status}</p><p>priority: ${detail.priority}</p><p>tags: ${detail.tags.join(', ') || '(none)'}</p></body></html>`;
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
