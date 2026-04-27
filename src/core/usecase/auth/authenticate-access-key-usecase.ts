import { AccessKeyPolicy } from '../../domain/services/access-key-policy.js';
import { ERROR_CODES } from '../../errors/error-codes.js';
import type { AccessKeyRepository } from '../../ports/repositories/access-key-repository.js';
import type { ProfileKeyWrapperRepository } from '../../ports/repositories/profile-key-wrapper-repository.js';

export type AccessKeyVerifier = {
  verify(rawAccessKey: string, keyHash: string, keySalt: string): Promise<boolean>;
};

export type KekDeriver = {
  deriveKek(rawAccessKey: string, keySalt: string): Promise<Uint8Array>;
};

export type DekCipher = {
  decrypt(encryptedDek: Uint8Array, kek: Uint8Array, wrapSalt: string): Promise<Uint8Array>;
};

export type SessionIssuer = {
  issue(input: { keyId: string; profileId: string; deviceFingerprint: string; issuedAt: string }): string;
};

export type AuthenticateAccessKeyInput = {
  keyId: string;
  rawAccessKey: string;
  targetProfileId: string;
  deviceFingerprint: string;
  now: string;
};

export type AuthenticateAccessKeyOutput = {
  keyId: string;
  profileId: string;
  sessionToken: string;
  decryptedDek: Uint8Array;
};

export class AuthenticateAccessKeyUseCase {
  public constructor(
    private readonly accessKeyRepository: AccessKeyRepository,
    private readonly profileKeyWrapperRepository: ProfileKeyWrapperRepository,
    private readonly accessKeyVerifier: AccessKeyVerifier,
    private readonly kekDeriver: KekDeriver,
    private readonly dekCipher: DekCipher,
    private readonly sessionIssuer: SessionIssuer,
    private readonly accessKeyPolicy: AccessKeyPolicy
  ) {}

  public async execute(input: AuthenticateAccessKeyInput): Promise<AuthenticateAccessKeyOutput> {
    const keyRow = await this.accessKeyRepository.findByKeyId(input.keyId);
    if (keyRow === null) {
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const validation = this.accessKeyPolicy.validate(keyRow, new Date(input.now));
    if (!validation.valid) {
      if (validation.reason === 'EXPIRED') {
        throw new Error(ERROR_CODES.KEY_EXPIRED);
      }
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const verified = await this.accessKeyVerifier.verify(input.rawAccessKey, keyRow.keyHash, keyRow.keySalt);
    if (!verified) {
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const wrapper = await this.profileKeyWrapperRepository.findActiveByProfileAndKeyId(input.targetProfileId, input.keyId);
    if (wrapper === null) {
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const kek = await this.kekDeriver.deriveKek(input.rawAccessKey, keyRow.keySalt);
    const decryptedDek = await this.dekCipher.decrypt(wrapper.encryptedDek, kek, wrapper.wrapSalt);
    const sessionToken = this.sessionIssuer.issue({
      keyId: input.keyId,
      profileId: input.targetProfileId,
      deviceFingerprint: input.deviceFingerprint,
      issuedAt: input.now
    });

    return {
      keyId: input.keyId,
      profileId: input.targetProfileId,
      sessionToken,
      decryptedDek
    };
  }
}
