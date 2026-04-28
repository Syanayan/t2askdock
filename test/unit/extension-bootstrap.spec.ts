import { describe, expect, it, vi } from 'vitest';
import { INITIAL_MIGRATION_V1_SQL } from '../../src/infra/sqlite/migrations/initial-migration-v1.js';

vi.mock('vscode', () => ({
  commands: { registerCommand: vi.fn() },
  window: { showInformationMessage: vi.fn() },
  workspace: { fs: { createDirectory: vi.fn() } },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
    joinPath: (...parts: Array<{ fsPath: string } | string>) => ({ fsPath: parts.map((p) => (typeof p === 'string' ? p : p.fsPath)).join('/') })
  }
}));
vi.mock('better-sqlite3', () => ({
  default: vi.fn()
}));

describe('extension bootstrapMigrations', () => {
  it('ensures storage directory, runs v1 migration, and registers client disposal', async () => {
    const { bootstrapMigrations } = await import('../../src/extension.js');
    const ensureDirectory = vi.fn().mockResolvedValue(undefined);
    const resolveDatabasePath = vi.fn().mockReturnValue('/tmp/taskdock.sqlite3');
    const migrate = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const createClient = vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
      exec: vi.fn(),
      close
    });
    const createMigrator = vi.fn().mockReturnValue({ migrate });

    const subscriptions: Array<{ dispose: () => void }> = [];

    await bootstrapMigrations(
      {
        globalStorageUri: { fsPath: '/tmp/taskdock' } as never,
        subscriptions
      },
      {
        ensureDirectory,
        resolveDatabasePath,
        createClient,
        createMigrator
      }
    );

    expect(ensureDirectory).toHaveBeenCalledWith('/tmp/taskdock');
    expect(resolveDatabasePath).toHaveBeenCalledWith('/tmp/taskdock');
    expect(createClient).toHaveBeenCalledWith('/tmp/taskdock.sqlite3');
    expect(migrate).toHaveBeenCalledWith([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }]);
    expect(subscriptions).toHaveLength(1);

    subscriptions[0].dispose();
    expect(close).toHaveBeenCalledOnce();
  });
});
