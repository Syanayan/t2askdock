import * as vscode from 'vscode';
import { INITIAL_MIGRATION_V1_SQL } from './infra/sqlite/migrations/initial-migration-v1.js';
import type { MigrationDependencies } from './infra/sqlite/migrations/migrator.js';
import { Migrator } from './infra/sqlite/migrations/migrator.js';
import { BetterSqlite3Client } from './infra/sqlite/better-sqlite3-client.js';

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

  const commandIds = [
    'taskDock.openTree',
    'taskDock.openBoard',
    'taskDock.selectDatabase',
    'taskDock.toggleReadOnly',
    'taskDock.createTask'
  ] as const;

  for (const commandId of commandIds) {
    const disposable = vscode.commands.registerCommand(commandId, async () => {
      await vscode.window.showInformationMessage(notImplementedMessage);
      return { commandId };
    });
    context.subscriptions.push(disposable);
  }
}

export function deactivate(): void {}
