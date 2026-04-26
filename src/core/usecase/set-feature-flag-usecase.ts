import type { AuditLogRepository } from '../ports/repositories/audit-log-repository.js';
import type { FeatureFlagRepository } from '../ports/repositories/feature-flag-repository.js';
import type { IdGenerator } from '../ports/services/id-generator.js';
import type { TransactionManager } from '../ports/services/transaction-manager.js';

export type SetFeatureFlagInput = {
  flagKey: string;
  enabled: boolean;
  scopeType: 'global' | 'profile' | 'user';
  scopeId: string | null;
  actorId: string;
  now: string;
};

export class SetFeatureFlagUseCase {
  public constructor(
    private readonly featureFlagRepository: FeatureFlagRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: SetFeatureFlagInput): Promise<void> {
    await this.transactionManager.runInTx(async () => {
      await this.featureFlagRepository.upsert({
        flagKey: input.flagKey,
        enabled: input.enabled,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        updatedBy: input.actorId,
        updatedAt: input.now
      });

      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'FEATURE_FLAG_UPDATED',
        targetType: 'feature_flag',
        targetId: input.flagKey,
        payloadDiffJson: JSON.stringify({
          enabled: input.enabled,
          scopeType: input.scopeType,
          scopeId: input.scopeId
        }),
        retentionClass: 'default',
        createdAt: input.now
      });
    });
  }
}
