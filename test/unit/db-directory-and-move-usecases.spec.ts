import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';
import { RegisterDatabaseDirectoryUseCase } from '../../src/core/usecase/db/register-database-directory-usecase.js';
import { ScanDatabaseDirectoryUseCase } from '../../src/core/usecase/db/scan-database-directory-usecase.js';
import { MoveTaskBetweenProfilesUseCase } from '../../src/core/usecase/db/move-task-between-profiles-usecase.js';

describe('directory management + move task usecases', () => {
  it('registers sqlite files from directory for admin only', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saveDirectoryRegistration = vi.fn().mockResolvedValue(undefined);
    const usecase = new RegisterDatabaseDirectoryUseCase(
      { save },
      {
        checkDirectory: vi.fn().mockResolvedValue({ exists: true, readable: true }),
        listSqliteFiles: vi.fn().mockResolvedValue(['/db/a.sqlite', '/db/b.db', '/db/c.sqlite3']),
        check: vi.fn().mockResolvedValue({ exists: true, readable: true, writable: true })
      },
      { saveDirectoryRegistration, saveMountKey: vi.fn(), deleteMountKey: vi.fn(), getMountKey: vi.fn(), getDirectoryRegistrations: vi.fn(), deleteDirectoryRegistration: vi.fn() },
      { nextUlid: vi.fn().mockReturnValue('p1') }
    );

    await expect(usecase.execute({ directoryPath: '/db', actorRole: 'general' })).rejects.toThrow(ERROR_CODES.FORBIDDEN);
    const out = await usecase.execute({ directoryPath: '/db', actorRole: 'admin' });
    expect(out.registeredProfiles).toHaveLength(3);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenNthCalledWith(1, expect.objectContaining({ profileId: 'p1' }));
    expect(saveDirectoryRegistration).toHaveBeenCalledWith('/db');
  });

  it('scan reports removed and publishes event', async () => {
    const publish = vi.fn();
    const scan = new ScanDatabaseDirectoryUseCase(
      { findAll: vi.fn().mockResolvedValue([{ path: '/db/a.sqlite', mountSource: 'directory', accessAllowed: true }]) },
      { check: vi.fn().mockResolvedValue({ exists: false, readable: false, writable: false }), checkDirectory: vi.fn(), listSqliteFiles: vi.fn().mockResolvedValue(['/db/a.sqlite', '/db/new.sqlite']) },
      { saveMountKey: vi.fn(), deleteMountKey: vi.fn(), getMountKey: vi.fn(), saveDirectoryRegistration: vi.fn(), getDirectoryRegistrations: vi.fn().mockResolvedValue(['/db']), deleteDirectoryRegistration: vi.fn() },
      { publish }
    );

    const out = await scan.execute();
    expect(out.scanResult.removed).toEqual(['/db/a.sqlite']);
    expect(out.scanResult.added).toEqual(['/db/new.sqlite']);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'DATABASE_DIRECTORY_UPDATED' }));
  });

  it('move task validates profiles/mode and writes audit log', async () => {
    const missingProfileRepo = { findById: vi.fn().mockResolvedValue({ profileId: 'p1', mode: 'readWrite' }).mockResolvedValueOnce(null) };
    const usecase = new MoveTaskBetweenProfilesUseCase(
      missingProfileRepo,
      { exportTaskGraph: vi.fn(), importTaskGraph: vi.fn(), softDeleteInSource: vi.fn() },
      { append: vi.fn() },
      { nextUlid: vi.fn().mockReturnValue('log1') }
    );
    await expect(usecase.execute({ taskId: 't1', sourceProfileId: 's', targetProfileId: 't', expectedVersion: 1, copyMode: true, actorRole: 'admin', actorId: 'u1', now: '2026-05-03T00:00:00.000Z' })).rejects.toThrow(ERROR_CODES.FILE_NOT_FOUND);

    const repo = { findById: vi.fn().mockResolvedValue({ profileId: 's', mode: 'readWrite' }).mockResolvedValueOnce({ profileId: 's', mode: 'readWrite' }).mockResolvedValueOnce({ profileId: 't', mode: 'readWrite' }) };
    const ops = { exportTaskGraph: vi.fn().mockResolvedValue({}), importTaskGraph: vi.fn().mockResolvedValue(undefined), softDeleteInSource: vi.fn().mockResolvedValue(undefined) };
    const append = vi.fn().mockResolvedValue(undefined);
    const ok = new MoveTaskBetweenProfilesUseCase(repo, ops, { append }, { nextUlid: vi.fn().mockReturnValue('log2') });
    const out = await ok.execute({ taskId: 't1', sourceProfileId: 's', targetProfileId: 't', expectedVersion: 1, copyMode: false, actorRole: 'admin', actorId: 'u1', now: '2026-05-03T00:00:00.000Z' });
    expect(out.taskMigrationSummary.copied).toBe(false);
    expect(ops.softDeleteInSource).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'TASK_MOVED_ACROSS_DB', retentionClass: 'default' }));
  });
});
