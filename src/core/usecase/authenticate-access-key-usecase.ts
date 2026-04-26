import { AccessKeyPolicy } from '../domain/services/access-key-policy.js';
import { ERROR_CODES } from '../errors/error-codes.js';
import type { AccessKeyRepository } from '../ports/repositories/access-key-repository.js';
import type { AuditLogRepository } from '../ports/repositories/audit-log-repository.js';
import type { DatabaseProfileRepository } from '../ports/repositories/database-profile-repository.js';
import type { TransactionManager } from '../ports/services/transaction-manager.js';

export type AuthenticateAccessKeyInput = {
  keyId: string;
  rawAccessKey: string;
  targetProfileId: string;
  deviceFingerprint: string;
  now: string;
};

export type AuthenticateAccessKeyOutput = {
  authenticated: true;
  profileId: string;
  keyId: string;
  principalId: string;
};

export interface AccessKeyVerifier {
  verify(input: { rawAccessKey: string; keyHash: string; keySalt: string; deviceFingerprint: string }): Promise<boolean>;
}

export class AuthenticateAccessKeyUseCase {
  public constructor(
    private readonly accessKeyRepository: AccessKeyRepository,
    private readonly databaseProfileRepository: DatabaseProfileRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly accessKeyVerifier: AccessKeyVerifier,
    private readonly accessKeyPolicy: AccessKeyPolicy
  ) {}

  public async execute(input: AuthenticateAccessKeyInput): Promise<AuthenticateAccessKeyOutput> {
    const accessKey = await this.accessKeyRepository.findByKeyId(input.keyId);
    if (accessKey === undefined) {
      await this.appendAuthFailedAudit(input, 'KEY_NOT_FOUND');
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const profile = await this.databaseProfileRepository.findById(input.targetProfileId);
    if (profile === undefined) {
      await this.appendAuthFailedAudit(input, 'PROFILE_NOT_FOUND');
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const validStatus = this.accessKeyPolicy.validate(accessKey, new Date(input.now));
    if (!validStatus.valid) {
      await this.appendAuthFailedAudit(input, validStatus.reason);
      throw new Error(validStatus.reason === 'EXPIRED' ? ERROR_CODES.KEY_EXPIRED : ERROR_CODES.AUTH_FAILED);
    }

    const verified = await this.accessKeyVerifier.verify({
      rawAccessKey: input.rawAccessKey,
      keyHash: accessKey.keyHash,
      keySalt: accessKey.keySalt,
      deviceFingerprint: input.deviceFingerprint
    });

    if (!verified) {
      await this.appendAuthFailedAudit(input, 'HASH_MISMATCH');
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    return {
      authenticated: true,
      profileId: profile.profileId,
      keyId: accessKey.keyId,
      principalId: accessKey.issuedFor
    };
  }

  private async appendAuthFailedAudit(input: AuthenticateAccessKeyInput, reason: string): Promise<void> {
    await this.transactionManager.runInTx(async () => {
      await this.auditLogRepository.append({
        logId: `${input.keyId}-${input.now}`,
        actorId: input.keyId,
        actionType: 'AUTH_FAILED',
        targetType: 'access_key',
        targetId: input.keyId,
        payloadDiffJson: JSON.stringify({ reason }),
        retentionClass: 'security',
        createdAt: input.now
      });
    });
  }
}
