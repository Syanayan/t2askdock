import { ERROR_CODES } from '../../errors/error-codes.js';
import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';

export type AuditArchivePurgeRepository = {
  preview(input: { fromYm: string; toYm: string }): Promise<{ affectedRows: number; estimatedBytes: number }>;
  countLegalHold(input: { fromYm: string; toYm: string }): Promise<number>;
  purge(input: { fromYm: string; toYm: string }): Promise<{ affectedRows: number }>;
};

export class PurgeAuditArchiveUseCase {
  public constructor(
    private readonly archiveRepository: AuditArchivePurgeRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: {
    fromYm: string;
    toYm: string;
    dryRun: boolean;
    approvedBy: string | null;
    actorId: string;
    actorRole: 'admin' | 'general';
    now: string;
  }): Promise<{ dryRun: boolean; affectedRows: number; estimatedBytes: number }> {
    if (input.actorRole !== 'admin') {
      throw new Error(ERROR_CODES.PERMISSION_DENIED);
    }

    const legalHoldCount = await this.archiveRepository.countLegalHold({ fromYm: input.fromYm, toYm: input.toYm });
    if (legalHoldCount > 0) {
      throw new Error(ERROR_CODES.AUDIT_ARCHIVE_FAILED);
    }

    const preview = await this.archiveRepository.preview({ fromYm: input.fromYm, toYm: input.toYm });
    if (input.dryRun) {
      return { dryRun: true, affectedRows: preview.affectedRows, estimatedBytes: preview.estimatedBytes };
    }

    if (input.approvedBy === null || input.approvedBy.length === 0) {
      throw new Error(ERROR_CODES.ARCHIVE_PURGE_DRYRUN_REQUIRED);
    }

    await this.auditLogRepository.append({
      logId: this.idGenerator.nextUlid(),
      actorId: input.actorId,
      actionType: 'AUDIT_ARCHIVE_PURGE_REQUESTED',
      targetType: 'audit_archive',
      targetId: null,
      payloadDiffJson: JSON.stringify({ fromYm: input.fromYm, toYm: input.toYm, approvedBy: input.approvedBy }),
      retentionClass: 'security',
      createdAt: input.now
    });

    const purged = await this.archiveRepository.purge({ fromYm: input.fromYm, toYm: input.toYm });

    await this.auditLogRepository.append({
      logId: this.idGenerator.nextUlid(),
      actorId: input.actorId,
      actionType: 'AUDIT_ARCHIVE_PURGED',
      targetType: 'audit_archive',
      targetId: null,
      payloadDiffJson: JSON.stringify({ fromYm: input.fromYm, toYm: input.toYm, affectedRows: purged.affectedRows }),
      retentionClass: 'security',
      createdAt: input.now
    });

    return {
      dryRun: false,
      affectedRows: purged.affectedRows,
      estimatedBytes: preview.estimatedBytes
    };
  }
}
