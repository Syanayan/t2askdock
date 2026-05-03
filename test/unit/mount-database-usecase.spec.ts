import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';
import { MountDatabaseUseCase } from '../../src/core/usecase/db/mount-database-usecase.js';
import { UnmountDatabaseUseCase } from '../../src/core/usecase/db/unmount-database-usecase.js';

describe('mount/unmount usecases', () => {
  it('enforces admin role and access checks, then saves/deletes', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(undefined);
    const saveMountKey = vi.fn().mockResolvedValue(undefined);
    const deleteMountKey = vi.fn().mockResolvedValue(undefined);
    const usecase = new MountDatabaseUseCase(
      { save },
      { check: vi.fn().mockResolvedValue({ exists: true, readable: true, writable: true }), checkDirectory: vi.fn(), listSqliteFiles: vi.fn() },
      { check: vi.fn().mockResolvedValue('healthy') },
      { saveMountKey, deleteMountKey, getMountKey: vi.fn(), saveDirectoryRegistration: vi.fn(), getDirectoryRegistrations: vi.fn(), deleteDirectoryRegistration: vi.fn() }
    );
    await expect(usecase.execute({ path: '/tmp/a.sqlite', name: 'A', mode: 'readWrite', actorRole: 'general' })).rejects.toThrow(ERROR_CODES.FORBIDDEN);

    const noFile = new MountDatabaseUseCase(
      { save },
      { check: vi.fn().mockResolvedValue({ exists: false, readable: false, writable: false }), checkDirectory: vi.fn(), listSqliteFiles: vi.fn() },
      { check: vi.fn().mockResolvedValue('healthy') },
      { saveMountKey, deleteMountKey, getMountKey: vi.fn(), saveDirectoryRegistration: vi.fn(), getDirectoryRegistrations: vi.fn(), deleteDirectoryRegistration: vi.fn() }
    );
    await expect(noFile.execute({ path: '/tmp/missing.sqlite', name: 'A', mode: 'readWrite', actorRole: 'admin' })).rejects.toThrow(ERROR_CODES.FILE_NOT_FOUND);

    const out = await usecase.execute({ path: '/tmp/a.sqlite', name: 'A', mode: 'readWrite', actorRole: 'admin' });
    expect(out.profileSummary.mountSource).toBe('individual');
    expect(save).toHaveBeenCalledOnce();
    expect(saveMountKey).toHaveBeenCalledOnce();

    const unmount = new UnmountDatabaseUseCase(
      { delete: del },
      { saveMountKey, deleteMountKey, getMountKey: vi.fn(), saveDirectoryRegistration: vi.fn(), getDirectoryRegistrations: vi.fn(), deleteDirectoryRegistration: vi.fn() }
    );
    await unmount.execute({ profileId: 'p1', actorRole: 'admin' });
    expect(del).toHaveBeenCalledWith('p1');
    expect(deleteMountKey).toHaveBeenCalledWith('p1');
  });
});
