import type { AuditLogRepository } from '../ports/repositories/audit-log-repository.js';
import type { ProjectPermissionRepository } from '../ports/repositories/project-permission-repository.js';
import type { IdGenerator } from '../ports/services/id-generator.js';
import type { TransactionManager } from '../ports/services/transaction-manager.js';

export class RunPermissionExpirySweepUseCase {
  public constructor(
    private readonly projectPermissionRepository: ProjectPermissionRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(actorId: string, now: string): Promise<number> {
    return this.transactionManager.runInTx(async () => {
      const expiredCount = await this.projectPermissionRepository.expireDuePermissions(now);
      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId,
        actionType: 'PROJECT_PERMISSION_EXPIRED',
        targetType: 'project_permission',
        targetId: null,
        payloadDiffJson: JSON.stringify({ expiredCount }),
        retentionClass: 'default',
        createdAt: now
      });

      return expiredCount;
    });
  }
}
