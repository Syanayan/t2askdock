import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';
import { NetworkFsSafetyGuard } from '../../src/core/services/safety/network-fs-safety-guard.js';
import { DetectTaskConflictUseCase } from '../../src/core/usecase/conflict/detect-task-conflict-usecase.js';
import { ResolveTaskConflictUseCase } from '../../src/core/usecase/conflict/resolve-task-conflict-usecase.js';
import { ArchiveAuditSearchPanel } from '../../src/ui/panels/archive-audit-search-panel.js';
import { UiEventBus } from '../../src/ui/events/ui-event-bus.js';
import { SqliteRetryExecutor } from '../../src/infra/sqlite/tx/sqlite-retry-executor.js';

describe('phase6 conflict/safety', () => {
  it('DetectTaskConflictUseCase detects mismatch and deleted conflicts', () => {
    const useCase = new DetectTaskConflictUseCase();

    expect(useCase.execute({ localVersion: 2, remoteVersion: 2 })).toEqual({ isConflict: false, conflictType: null });
    expect(useCase.execute({ localVersion: 2, remoteVersion: 3 })).toEqual({ isConflict: true, conflictType: 'VersionMismatch' });
    expect(useCase.execute({ localVersion: 2, remoteVersion: null })).toEqual({ isConflict: true, conflictType: 'Deleted' });
  });

  it('ResolveTaskConflictUseCase supports LOCAL/REMOTE/MANUAL strategies', () => {
    const useCase = new ResolveTaskConflictUseCase();
    const local = {
      taskId: 't1',
      title: 'local',
      description: null,
      status: 'todo' as const,
      priority: 'medium' as const,
      assignee: null,
      dueDate: null,
      tags: ['l'],
      parentTaskId: null,
      version: 2,
      updatedAt: '2026-04-27T00:00:00.000Z',
      updatedBy: 'u1'
    };
    const remote = { ...local, title: 'remote', version: 3, tags: ['r'] };
    const manual = { ...local, title: 'manual', tags: ['l', 'r'] };

    expect(useCase.execute({ strategy: 'LOCAL', local, remote }).resolved.title).toBe('local');
    expect(useCase.execute({ strategy: 'REMOTE', local, remote }).resolved.title).toBe('remote');
    expect(useCase.execute({ strategy: 'MANUAL', local, remote, manual }).resolved.title).toBe('manual');

    expect(() => useCase.execute({ strategy: 'REMOTE', local, remote: null })).toThrow(ERROR_CODES.TASK_CONFLICT);
    expect(() => useCase.execute({ strategy: 'MANUAL', local, remote })).toThrow(ERROR_CODES.VALIDATION_FAILED);
  });

  it('NetworkFsSafetyGuard validates lock diagnostics and RTT threshold', () => {
    const guard = new NetworkFsSafetyGuard(250, 150);

    expect(
      guard.diagnose({
        lockAcquisitionMs: 12,
        heartbeatRttMs: 45,
        lockConsistencyOk: true
      })
    ).toEqual({ safe: true, reason: 'ok' });

    expect(
      guard.diagnose({
        lockAcquisitionMs: 500,
        heartbeatRttMs: 45,
        lockConsistencyOk: true
      })
    ).toEqual({ safe: false, reason: 'lock_inconsistent' });

    expect(() =>
      guard.assertSafe({
        lockAcquisitionMs: 5,
        heartbeatRttMs: 500,
        lockConsistencyOk: true
      })
    ).toThrow(ERROR_CODES.DB_LOCK_UNSAFE);
  });

  it('SqliteRetryExecutor retries SQLITE_BUSY/IOERR and stops on non-retryable errors', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const executor = new SqliteRetryExecutor({ maxRetries: 3, baseDelayMs: 10 }, { sleep });

    let attempts = 0;
    const output = await executor.run(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('SQLITE_BUSY: db is locked');
      }
      return 'ok';
    });

    expect(output).toBe('ok');
    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);

    await expect(executor.run(async () => Promise.reject(new Error('SOMETHING_ELSE')))).rejects.toThrow('SOMETHING_ELSE');
  });

  it('ArchiveAuditSearchPanel applies purge operation guards (admin + approval)', async () => {
    const panel = new ArchiveAuditSearchPanel(
      { search: vi.fn().mockResolvedValue([]) },
      { execute: vi.fn().mockResolvedValue({ affectedRows: 1 }) },
      new UiEventBus()
    );

    await expect(
      panel.purgeExecute({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        actorId: 'u1',
        actorRole: 'general',
        approved: true
      })
    ).rejects.toThrow(ERROR_CODES.PERMISSION_DENIED);

    await expect(
      panel.purgeExecute({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        actorId: 'admin',
        actorRole: 'admin',
        approved: false
      })
    ).rejects.toThrow(ERROR_CODES.ARCHIVE_PURGE_DRYRUN_REQUIRED);
  });
});
