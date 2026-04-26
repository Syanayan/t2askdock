import type { AuditLogRepository } from '../ports/repositories/audit-log-repository.js';
import type { ProjectPermissionRepository } from '../ports/repositories/project-permission-repository.js';
import type { IdGenerator } from '../ports/services/id-generator.js';
import type { TransactionManager } from '../ports/services/transaction-manager.js';

export type GrantProjectEditPermissionInput = {
  grantId: string;
  projectId: string;
  userId: string;
  canEdit: boolean;
  actorId: string;
  now: string;
  expiresAt: string | null;
};

export class GrantProjectEditPermissionUseCase {
  public constructor(
    private readonly projectPermissionRepository: ProjectPermissionRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: GrantProjectEditPermissionInput): Promise<void> {
    await this.transactionManager.runInTx(async () => {
      await this.projectPermissionRepository.grant({
        grantId: input.grantId,
        projectId: input.projectId,
        userId: input.userId,
        canEdit: input.canEdit,
        grantedBy: input.actorId,
        grantedAt: input.now,
        expiresAt: input.expiresAt
      });

      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'PROJECT_PERMISSION_GRANTED',
        targetType: 'project_permission',
        targetId: input.grantId,
        payloadDiffJson: JSON.stringify({ projectId: input.projectId, userId: input.userId, canEdit: input.canEdit }),
        retentionClass: 'default',
        createdAt: input.now
      });
    });
  }
}
