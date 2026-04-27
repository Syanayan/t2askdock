import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';

export type AuditArchiveOperator = {
  archiveOlderThan(input: { before: string; now: string }): Promise<{
    archivedRecords: number;
    archivedBuckets: string[];
  }>;
};

export class ArchiveAuditLogsUseCase {
  public constructor(
    private readonly archiveOperator: AuditArchiveOperator,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: {
    actorId: string;
    now: string;
    olderThan: string;
  }): Promise<{ archivedRecords: number; archivedBuckets: string[] }> {
    const result = await this.archiveOperator.archiveOlderThan({ before: input.olderThan, now: input.now });

    await this.auditLogRepository.append({
      logId: this.idGenerator.nextUlid(),
      actorId: input.actorId,
      actionType: 'AUDIT_ARCHIVED',
      targetType: 'audit_archive',
      targetId: null,
      payloadDiffJson: JSON.stringify(result),
      retentionClass: 'security',
      createdAt: input.now
    });

    return result;
  }
}
