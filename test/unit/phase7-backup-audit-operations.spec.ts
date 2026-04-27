import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/core/errors/error-codes.js';
import { CreateBackupSnapshotUseCase } from '../../src/core/usecase/backup/create-backup-snapshot-usecase.js';
import { RestoreBackupSnapshotUseCase } from '../../src/core/usecase/backup/restore-backup-snapshot-usecase.js';
import { ArchiveAuditLogsUseCase } from '../../src/core/usecase/audit/archive-audit-logs-usecase.js';
import { PurgeAuditArchiveUseCase } from '../../src/core/usecase/audit/purge-audit-archive-usecase.js';

describe('phase7 backup/audit operations', () => {
  it('CreateBackupSnapshotUseCase creates and rotates snapshots with audit records', async () => {
    const createSnapshot = vi.fn().mockResolvedValue({
      storagePath: '/tmp/backup.db',
      checksum: 'abc123',
      sizeBytes: 1024
    });
    const create = vi.fn().mockResolvedValue({ snapshotId: 'snp_1' });
    const rotate = vi.fn().mockResolvedValue({ removedSnapshotIds: ['snp_old'] });
    const append = vi.fn().mockResolvedValue(undefined);

    const useCase = new CreateBackupSnapshotUseCase(
      { createSnapshot },
      { create, rotate },
      { append },
      { nextUlid: vi.fn().mockReturnValueOnce('log_1').mockReturnValueOnce('log_2') }
    );

    const result = await useCase.execute({
      profileId: 'p1',
      trigger: 'manual',
      actorId: 'admin1',
      actorRole: 'admin',
      now: '2026-04-27T00:00:00.000Z'
    });

    expect(result).toEqual({ snapshotId: 'snp_1', removedSnapshotIds: ['snp_old'] });
    expect(append).toHaveBeenCalledTimes(2);
  });

  it('RestoreBackupSnapshotUseCase supports dry-run and successful restore', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const useCase = new RestoreBackupSnapshotUseCase(
      {
        findById: vi.fn().mockResolvedValue({
          snapshotId: 'snp_1',
          profileId: 'p1',
          checksum: 'sha-1',
          storagePath: '/tmp/backup'
        })
      },
      { verify: vi.fn().mockResolvedValue(true) },
      {
        previewDiff: vi.fn().mockResolvedValue({ changedTables: ['tasks'], changedRows: 9 }),
        backupCurrent: vi.fn().mockResolvedValue({ backupSnapshotId: 'pre_restore' }),
        restore: vi.fn().mockResolvedValue(undefined),
        verifyConnection: vi.fn().mockResolvedValue(true)
      },
      { append },
      { nextUlid: vi.fn().mockReturnValue('log_1') }
    );

    const dryRun = await useCase.execute({
      snapshotId: 'snp_1',
      targetProfileId: 'p2',
      dryRun: true,
      actorId: 'admin1',
      actorRole: 'admin',
      now: '2026-04-27T00:00:00.000Z'
    });
    expect(dryRun).toEqual({
      dryRun: true,
      diff: { changedTables: ['tasks'], changedRows: 9 },
      backupSnapshotId: null
    });

    const restored = await useCase.execute({
      snapshotId: 'snp_1',
      targetProfileId: 'p2',
      dryRun: false,
      actorId: 'admin1',
      actorRole: 'admin',
      now: '2026-04-27T00:00:00.000Z'
    });
    expect(restored.backupSnapshotId).toBe('pre_restore');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('ArchiveAuditLogsUseCase stores daily archive execution audit', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const useCase = new ArchiveAuditLogsUseCase(
      {
        archiveOlderThan: vi.fn().mockResolvedValue({
          archivedRecords: 480,
          archivedBuckets: ['2025-12', '2026-01']
        })
      },
      { append },
      { nextUlid: vi.fn().mockReturnValue('log_archive') }
    );

    const result = await useCase.execute({
      actorId: 'system',
      now: '2026-04-27T00:00:00.000Z',
      olderThan: '2026-01-27T00:00:00.000Z'
    });

    expect(result.archivedRecords).toBe(480);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('PurgeAuditArchiveUseCase enforces legal hold and approval flow', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const useCase = new PurgeAuditArchiveUseCase(
      {
        countLegalHold: vi
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
        preview: vi.fn().mockResolvedValue({ affectedRows: 20, estimatedBytes: 2000 }),
        purge: vi.fn().mockResolvedValue({ affectedRows: 18 })
      },
      { append },
      { nextUlid: vi.fn().mockReturnValueOnce('log_1').mockReturnValueOnce('log_2') }
    );

    await expect(
      useCase.execute({
        fromYm: '2025-01',
        toYm: '2025-12',
        dryRun: true,
        approvedBy: null,
        actorId: 'admin1',
        actorRole: 'admin',
        now: '2026-04-27T00:00:00.000Z'
      })
    ).rejects.toThrow(ERROR_CODES.AUDIT_ARCHIVE_FAILED);

    await expect(
      useCase.execute({
        fromYm: '2025-01',
        toYm: '2025-12',
        dryRun: false,
        approvedBy: null,
        actorId: 'admin1',
        actorRole: 'admin',
        now: '2026-04-27T00:00:00.000Z'
      })
    ).rejects.toThrow(ERROR_CODES.ARCHIVE_PURGE_DRYRUN_REQUIRED);

    const result = await useCase.execute({
      fromYm: '2025-01',
      toYm: '2025-12',
      dryRun: false,
      approvedBy: 'security-owner',
      actorId: 'admin1',
      actorRole: 'admin',
      now: '2026-04-27T00:00:00.000Z'
    });

    expect(result).toEqual({ dryRun: false, affectedRows: 18, estimatedBytes: 2000 });
    expect(append).toHaveBeenCalledTimes(2);
  });

  it('phase7 usecases deny non-admin operations', async () => {
    const createBackup = new CreateBackupSnapshotUseCase(
      { createSnapshot: vi.fn() },
      { create: vi.fn(), rotate: vi.fn() },
      { append: vi.fn() },
      { nextUlid: vi.fn() }
    );
    await expect(
      createBackup.execute({
        profileId: 'p1',
        trigger: 'manual',
        actorId: 'u1',
        actorRole: 'general',
        now: '2026-04-27T00:00:00.000Z'
      })
    ).rejects.toThrow(ERROR_CODES.PERMISSION_DENIED);

    const restore = new RestoreBackupSnapshotUseCase(
      { findById: vi.fn() },
      { verify: vi.fn() },
      {
        previewDiff: vi.fn(),
        backupCurrent: vi.fn(),
        restore: vi.fn(),
        verifyConnection: vi.fn()
      },
      { append: vi.fn() },
      { nextUlid: vi.fn() }
    );
    await expect(
      restore.execute({
        snapshotId: 'snp_1',
        targetProfileId: 'p2',
        dryRun: true,
        actorId: 'u1',
        actorRole: 'general',
        now: '2026-04-27T00:00:00.000Z'
      })
    ).rejects.toThrow(ERROR_CODES.PERMISSION_DENIED);
  });
});
