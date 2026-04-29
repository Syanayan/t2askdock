import * as vscode from 'vscode';
import { TaskDockCommandRegistry } from './ui/commands/command-registry.js';
import { UiEventBus } from './ui/events/ui-event-bus.js';
import { ExtensionStateStore } from './ui/state/extension-state-store.js';
import { INITIAL_MIGRATION_V1_SQL } from './infra/sqlite/migrations/initial-migration-v1.js';
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
import { TaskTreeViewProvider } from './ui/tree/task-tree-view-provider.js';
import type { TaskTreeItem } from './ui/tree/task-tree-view-provider.js';
import { StatusBarController } from './ui/status/status-bar-controller.js';
import { BoardWebviewPanel } from './ui/webview/board-webview-panel.js';

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

  await migrator.migrate([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }]);
  context.subscriptions.push({ dispose: () => client.close() });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await bootstrapMigrations(context);

  const databasePath = vscode.Uri.joinPath(context.globalStorageUri, 'taskdock.sqlite3').fsPath;
  const client = new BetterSqlite3Client(databasePath);
  context.subscriptions.push({ dispose: () => client.close() });

  const appContainer = new AppContainer({
    taskRepository: new TaskRepository(client),
    commentRepository: new CommentRepository(client),
    auditLogRepository: new AuditLogRepository(client),
    transactionManager: new TransactionManager(client),
    idGenerator: new UlidIdGenerator(),
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
  const taskTreeViewProvider = new TaskTreeViewProvider(appContainer.buildProjectTaskLoader());
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

  context.subscriptions.push(
    dbStatusBarItem,
    modeStatusBarItem,
    healthStatusBarItem,
    { dispose: disposeProfileSwitched },
    { dispose: disposeModeChanged },
    { dispose: disposeHealthChanged },
    vscode.window.registerTreeDataProvider<TaskTreeItem>('taskDock.treeView', {
      getChildren: async (element?: TaskTreeItem) => taskTreeViewProvider.getChildren(element),
      getTreeItem: (element: TaskTreeItem) => {
        const collapsibleState = element.hasChildren
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
        return new vscode.TreeItem(element.label, collapsibleState);
      }
    }),
    vscode.commands.registerCommand('taskDock.openTree', async () => {
      await vscode.commands.executeCommand('taskDock.treeView.focus');
      return commands['taskDock.openTree']();
    }),
    vscode.commands.registerCommand('taskDock.openBoard', async () => {
      const webviewPanel = vscode.window.createWebviewPanel(
        BoardWebviewPanel.VIEW_TYPE,
        'Task Dock Board',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      boardPanel.render(webviewPanel);
      return commands['taskDock.openBoard']();
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
    vscode.commands.registerCommand('taskDock.createTask', async (input) => commands['taskDock.createTask'](input))
  );
}

export function deactivate(): void {}
