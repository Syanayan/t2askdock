import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';
import type { TransactionManager } from '../../ports/services/transaction-manager.js';

export type AccessKeyRevoker = {
  revoke(keyId: string, revokedAt: string): Promise<void>;
};

export type ProfileKeyWrapperRevoker = {
  revokeByKeyId(keyId: string, revokedAt: string): Promise<void>;
};

export type SessionRevoker = {
  revokeByKeyId(keyId: string, now: string): number;
};

export class RevokeAccessKeyUseCase {
  public constructor(
    private readonly accessKeyRepository: AccessKeyRevoker,
    private readonly profileKeyWrapperRepository: ProfileKeyWrapperRevoker,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator,
    private readonly sessionRevoker: SessionRevoker
  ) {}

  public async execute(input: { keyId: string; actorId: string; now: string }): Promise<{ revokedSessions: number }> {
    let revokedSessions = 0;

    await this.transactionManager.runInTx(async () => {
      await this.accessKeyRepository.revoke(input.keyId, input.now);
      await this.profileKeyWrapperRepository.revokeByKeyId(input.keyId, input.now);
      revokedSessions = this.sessionRevoker.revokeByKeyId(input.keyId, input.now);
      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'KEY_REVOKED',
        targetType: 'access_key',
        targetId: input.keyId,
        payloadDiffJson: JSON.stringify({ revokedSessions }),
        retentionClass: 'security',
        createdAt: input.now
      });
    });

    return { revokedSessions };
  }
}
