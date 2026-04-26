import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/core/errors/error-codes.js';
import { INITIAL_MIGRATION_V1_SQL } from '../../../../src/infra/sqlite/migrations/initial-migration-v1.js';
import { Migrator } from '../../../../src/infra/sqlite/migrations/migrator.js';
import { FakeSqliteClient } from './fake-client.js';

describe('Migrator', () => {
  it('applies pending migration and writes schema_version', async () => {
    const client = new FakeSqliteClient();
    client.getResult = { version: 0 };

    const migrator = new Migrator({
      client,
      snapshot: vi.fn().mockResolvedValue(undefined),
      restoreSnapshot: vi.fn().mockResolvedValue(undefined),
      reconnectReadOnly: vi.fn().mockResolvedValue(undefined),
      appendMigrationFailedAudit: vi.fn().mockResolvedValue(undefined)
    });

    await migrator.migrate([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }]);

    expect(client.executed.some((x) => x.type === 'run' && x.sql.includes('INSERT INTO schema_version'))).toBe(true);
  });

  it('restores snapshot and switches read-only when migration fails', async () => {
    const client = new FakeSqliteClient();
    client.getResult = { version: 0 };
    client.failOnExecSql = 'CREATE TABLE IF NOT EXISTS users';

    const restoreSnapshot = vi.fn().mockResolvedValue(undefined);
    const reconnectReadOnly = vi.fn().mockResolvedValue(undefined);
    const appendMigrationFailedAudit = vi.fn().mockResolvedValue(undefined);

    const migrator = new Migrator({
      client,
      snapshot: vi.fn().mockResolvedValue(undefined),
      restoreSnapshot,
      reconnectReadOnly,
      appendMigrationFailedAudit
    });

    await expect(migrator.migrate([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }])).rejects.toThrow(
      ERROR_CODES.MIGRATION_REQUIRED
    );

    expect(restoreSnapshot).toHaveBeenCalledOnce();
    expect(reconnectReadOnly).toHaveBeenCalledOnce();
    expect(appendMigrationFailedAudit).toHaveBeenCalledOnce();
  });
});
