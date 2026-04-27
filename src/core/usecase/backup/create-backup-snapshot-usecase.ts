import { ERROR_CODES } from '../../errors/error-codes.js';
import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';

export type BackupTrigger = 'manual' | 'scheduled_daily' | 'pre_critical_operation';

export type BackupSnapshotWriter = {
  create(input: {
    profileId: string;
    storagePath: string;
    checksum: string;
    sizeBytes: number;
    createdBy: string;
    createdAt: string;
  }): Promise<{ snapshotId: string }>;
  rotate(profileId: string, now: string): Promise<{ removedSnapshotIds: ReadonlyArray<string> }>;
};

export type BackupSnapshotFactory = {
  createSnapshot(input: { profileId: string; trigger: BackupTrigger; now: string }): Promise<{
    storagePath: string;
    checksum: string;
    sizeBytes: number;
  }>;
};

export class CreateBackupSnapshotUseCase {
  public constructor(
    private readonly snapshotFactory: BackupSnapshotFactory,
    private readonly snapshotWriter: BackupSnapshotWriter,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: {
    profileId: string;
    trigger: BackupTrigger;
    actorId: string;
    actorRole: 'admin' | 'general';
    now: string;
  }): Promise<{ snapshotId: string; removedSnapshotIds: ReadonlyArray<string> }> {
    if (input.actorRole !== 'admin') {
      throw new Error(ERROR_CODES.PERMISSION_DENIED);
    }

    const built = await this.snapshotFactory.createSnapshot({
      profileId: input.profileId,
      trigger: input.trigger,
      now: input.now
    });

    const created = await this.snapshotWriter.create({
      profileId: input.profileId,
      storagePath: built.storagePath,
      checksum: built.checksum,
      sizeBytes: built.sizeBytes,
      createdBy: input.actorId,
      createdAt: input.now
    });

    const rotated = await this.snapshotWriter.rotate(input.profileId, input.now);

    await this.auditLogRepository.append({
      logId: this.idGenerator.nextUlid(),
      actorId: input.actorId,
      actionType: 'BACKUP_CREATED',
      targetType: 'backup_snapshot',
      targetId: created.snapshotId,
      payloadDiffJson: JSON.stringify({ trigger: input.trigger, profileId: input.profileId }),
      retentionClass: 'security',
      createdAt: input.now
    });

    if (rotated.removedSnapshotIds.length > 0) {
      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'BACKUP_ROTATED',
        targetType: 'backup_snapshot',
        targetId: null,
        payloadDiffJson: JSON.stringify({ removedSnapshotIds: rotated.removedSnapshotIds, profileId: input.profileId }),
        retentionClass: 'security',
        createdAt: input.now
      });
    }

    return {
      snapshotId: created.snapshotId,
      removedSnapshotIds: rotated.removedSnapshotIds
    };
  }
}
