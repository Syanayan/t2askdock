import type { AuditLogRepository } from '../../ports/repositories/audit-log-repository.js';
import type { IdGenerator } from '../../ports/services/id-generator.js';
import type { TransactionManager } from '../../ports/services/transaction-manager.js';

export type AccessKeyWriter = {
  save(input: {
    keyId: string;
    ownerType: 'user' | 'device';
    issuedFor: string;
    keyHash: string;
    keySalt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    issuedBy: string;
    issuedAt: string;
  }): Promise<void>;
};

export type ProfileKeyWrapperWriter = {
  upsert(input: {
    profileId: string;
    keyId: string;
    encryptedDek: Uint8Array;
    wrapSalt: string;
    kekVersion: number;
    wrapperStatus: 'active' | 'revoked' | 'rotating';
    createdAt: string;
    revokedAt: string | null;
  }): Promise<void>;
};

export type AccessKeyHasher = {
  createAccessKey(): string;
  hash(rawAccessKey: string): Promise<{ keyHash: string; keySalt: string }>;
};

export type ProfileDekWrapperFactory = {
  createActiveWrapper(input: { profileId: string; keyId: string; rawAccessKey: string; now: string }): Promise<{
    encryptedDek: Uint8Array;
    wrapSalt: string;
    kekVersion: number;
  }>;
};

export class IssueAccessKeyUseCase {
  public constructor(
    private readonly accessKeyRepository: AccessKeyWriter,
    private readonly profileKeyWrapperRepository: ProfileKeyWrapperWriter,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator,
    private readonly accessKeyHasher: AccessKeyHasher,
    private readonly profileDekWrapperFactory: ProfileDekWrapperFactory
  ) {}

  public async execute(input: {
    ownerType: 'user' | 'device';
    issuedFor: string;
    profileIds: ReadonlyArray<string>;
    expiresAt: string | null;
    issuedBy: string;
    now: string;
  }): Promise<{ keyId: string; rawAccessKey: string }> {
    const keyId = this.idGenerator.nextUlid();
    const rawAccessKey = this.accessKeyHasher.createAccessKey();
    const { keyHash, keySalt } = await this.accessKeyHasher.hash(rawAccessKey);

    await this.transactionManager.runInTx(async () => {
      await this.accessKeyRepository.save({
        keyId,
        ownerType: input.ownerType,
        issuedFor: input.issuedFor,
        keyHash,
        keySalt,
        expiresAt: input.expiresAt,
        revokedAt: null,
        issuedBy: input.issuedBy,
        issuedAt: input.now
      });

      for (const profileId of input.profileIds) {
        const wrapper = await this.profileDekWrapperFactory.createActiveWrapper({ profileId, keyId, rawAccessKey, now: input.now });
        await this.profileKeyWrapperRepository.upsert({
          profileId,
          keyId,
          encryptedDek: wrapper.encryptedDek,
          wrapSalt: wrapper.wrapSalt,
          kekVersion: wrapper.kekVersion,
          wrapperStatus: 'active',
          createdAt: input.now,
          revokedAt: null
        });
      }

      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.issuedBy,
        actionType: 'KEY_ISSUED',
        targetType: 'access_key',
        targetId: keyId,
        payloadDiffJson: JSON.stringify({ ownerType: input.ownerType, issuedFor: input.issuedFor, profileIds: input.profileIds }),
        retentionClass: 'security',
        createdAt: input.now
      });
    });

    return { keyId, rawAccessKey };
  }
}
