import { ERROR_CODES } from '../../errors/error-codes.js';
import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';

export type BackupSnapshotReader = {
  findById(snapshotId: string): Promise<{
    snapshotId: string;
    profileId: string;
    checksum: string;
    storagePath: string;
  } | null>;
};

export type SnapshotIntegrityVerifier = {
  verify(input: { snapshotId: string; checksum: string; storagePath: string }): Promise<boolean>;
};

export type BackupRestoreOperator = {
  previewDiff(input: { snapshotId: string; targetProfileId: string }): Promise<{ changedTables: string[]; changedRows: number }>;
  backupCurrent(input: { targetProfileId: string; now: string }): Promise<{ backupSnapshotId: string }>;
  restore(input: { snapshotId: string; targetProfileId: string }): Promise<void>;
  verifyConnection(input: { targetProfileId: string }): Promise<boolean>;
};

export class RestoreBackupSnapshotUseCase {
  public constructor(
    private readonly snapshotReader: BackupSnapshotReader,
    private readonly integrityVerifier: SnapshotIntegrityVerifier,
    private readonly restoreOperator: BackupRestoreOperator,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: {
    snapshotId: string;
    targetProfileId: string;
    dryRun: boolean;
    actorId: string;
    actorRole: 'admin' | 'general';
    now: string;
  }): Promise<{ dryRun: boolean; diff: { changedTables: string[]; changedRows: number }; backupSnapshotId: string | null }> {
    if (input.actorRole !== 'admin') {
      throw new Error(ERROR_CODES.PERMISSION_DENIED);
    }

    const snapshot = await this.snapshotReader.findById(input.snapshotId);
    if (snapshot === null) {
      throw new Error(ERROR_CODES.BACKUP_RESTORE_FAILED);
    }

    const integrityOk = await this.integrityVerifier.verify({
      snapshotId: snapshot.snapshotId,
      checksum: snapshot.checksum,
      storagePath: snapshot.storagePath
    });
    if (!integrityOk) {
      throw new Error(ERROR_CODES.BACKUP_RESTORE_FAILED);
    }

    const diff = await this.restoreOperator.previewDiff({
      snapshotId: input.snapshotId,
      targetProfileId: input.targetProfileId
    });

    if (input.dryRun) {
      return { dryRun: true, diff, backupSnapshotId: null };
    }

    const backupCurrent = await this.restoreOperator.backupCurrent({
      targetProfileId: input.targetProfileId,
      now: input.now
    });

    await this.restoreOperator.restore({ snapshotId: input.snapshotId, targetProfileId: input.targetProfileId });
    const connectionOk = await this.restoreOperator.verifyConnection({ targetProfileId: input.targetProfileId });
    if (!connectionOk) {
      throw new Error(ERROR_CODES.BACKUP_RESTORE_FAILED);
    }

    await this.auditLogRepository.append({
      logId: this.idGenerator.nextUlid(),
      actorId: input.actorId,
      actionType: 'BACKUP_RESTORED',
      targetType: 'backup_snapshot',
      targetId: input.snapshotId,
      payloadDiffJson: JSON.stringify({
        targetProfileId: input.targetProfileId,
        backupSnapshotId: backupCurrent.backupSnapshotId,
        changedRows: diff.changedRows
      }),
      retentionClass: 'security',
      createdAt: input.now
    });

    return {
      dryRun: false,
      diff,
      backupSnapshotId: backupCurrent.backupSnapshotId
    };
  }
}
