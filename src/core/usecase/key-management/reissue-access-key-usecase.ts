import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';
import type { TransactionManager } from '../../ports/services/transaction-manager.js';
import { IssueAccessKeyUseCase } from './issue-access-key-usecase.js';
import { RevokeAccessKeyUseCase } from './revoke-access-key-usecase.js';

export class ReissueAccessKeyUseCase {
  public constructor(
    private readonly revokeAccessKeyUseCase: Pick<RevokeAccessKeyUseCase, 'execute'>,
    private readonly issueAccessKeyUseCase: Pick<IssueAccessKeyUseCase, 'execute'>,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: {
    oldKeyId: string;
    ownerType: 'user' | 'device';
    issuedFor: string;
    profileIds: ReadonlyArray<string>;
    expiresAt: string | null;
    issuedBy: string;
    now: string;
  }): Promise<{ keyId: string; rawAccessKey: string }> {
    let issued: { keyId: string; rawAccessKey: string } = { keyId: '', rawAccessKey: '' };

    await this.transactionManager.runInTx(async () => {
      await this.revokeAccessKeyUseCase.execute({ keyId: input.oldKeyId, actorId: input.issuedBy, now: input.now });
      issued = await this.issueAccessKeyUseCase.execute({
        ownerType: input.ownerType,
        issuedFor: input.issuedFor,
        profileIds: input.profileIds,
        expiresAt: input.expiresAt,
        issuedBy: input.issuedBy,
        now: input.now
      });

      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.issuedBy,
        actionType: 'KEY_REISSUED',
        targetType: 'access_key',
        targetId: issued.keyId,
        payloadDiffJson: JSON.stringify({ oldKeyId: input.oldKeyId, newKeyId: issued.keyId }),
        retentionClass: 'security',
        createdAt: input.now
      });
    });

    return issued;
  }
}
