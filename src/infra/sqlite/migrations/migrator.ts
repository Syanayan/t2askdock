import { ERROR_CODES } from '../../../core/errors/error-codes.js';
import type { SqliteClient } from '../sqlite-client.js';

export interface Migration {
  version: number;
  statements: ReadonlyArray<string>;
}

export interface MigrationDependencies {
  client: SqliteClient;
  snapshot: () => Promise<void>;
  restoreSnapshot: () => Promise<void>;
  reconnectReadOnly: () => Promise<void>;
  appendMigrationFailedAudit: () => Promise<void>;
}

export class Migrator {
  public constructor(private readonly deps: MigrationDependencies) {}

  public async migrate(migrations: ReadonlyArray<Migration>): Promise<void> {
    await this.deps.client.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    const current = await this.deps.client.get<{ version: number | null }>('SELECT MAX(version) as version FROM schema_version');
    const currentVersion = current?.version ?? 0;
    const pending = migrations.filter((item) => item.version > currentVersion).sort((a, b) => a.version - b.version);

    for (const migration of pending) {
      await this.deps.snapshot();
      try {
        for (const statement of migration.statements) {
          await this.deps.client.exec(statement);
        }
        await this.deps.client.run('INSERT INTO schema_version(version, applied_at) VALUES (?, ?)', [migration.version, new Date().toISOString()]);
      } catch (error) {
        await this.deps.restoreSnapshot();
        await this.deps.reconnectReadOnly();
        await this.deps.appendMigrationFailedAudit();

        throw this.createMigrationRequiredError(error);
      }
    }
  }

  private createMigrationRequiredError(cause: unknown): Error {
    const migrationError = new Error(ERROR_CODES.MIGRATION_REQUIRED);
    (migrationError as Error & { cause?: unknown }).cause = cause;
    return migrationError;
  }
}
