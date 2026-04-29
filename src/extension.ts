import * as vscode from 'vscode';
import { TaskDockCommandRegistry } from './ui/commands/command-registry.js';
import { UiEventBus } from './ui/events/ui-event-bus.js';
import { ExtensionStateStore } from './ui/state/extension-state-store.js';
import { INITIAL_MIGRATION_V1_SQL } from './infra/sqlite/migrations/initial-migration-v1.js';
import type { MigrationDependencies } from './infra/sqlite/migrations/migrator.js';
import { Migrator } from './infra/sqlite/migrations/migrator.js';
import { BetterSqlite3Client } from './infra/sqlite/better-sqlite3-client.js';
import { TaskTreeViewProvider } from './ui/tree/task-tree-view-provider.js';

const notImplementedMessage = 'taskDock command is registered. Implementation wiring is pending.';

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

  const eventBus = new UiEventBus();
  const stateStore = new ExtensionStateStore();
  const taskTreeViewProvider = new TaskTreeViewProvider({
    listProjects: async () => [],
    listTasksByProject: async () => []
  });
  const commandRegistry = new TaskDockCommandRegistry(
    {
      execute: async (input) => ({ id: input.taskId, title: input.title })
    } as never,
    {
      execute: async ({ profileId }) => ({
        profileSummary: { profileId, path: context.globalStorageUri.fsPath },
        connectionMode: 'readWrite',
        healthStatus: 'healthy'
      })
    } as never,
    {
      execute: async ({ enabled }) => ({ mode: enabled ? 'readOnly' : 'readWrite' })
    } as never,
    stateStore,
    eventBus
  );
  const commands = commandRegistry.register();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('taskDock.treeView', {
      getChildren: async (element?: { kind: 'project' | 'task'; id: string }) => taskTreeViewProvider.getChildren(element as never),
      getTreeItem: (element) => {
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
      await vscode.window.showInformationMessage(notImplementedMessage);
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
