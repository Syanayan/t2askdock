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
    private readonly sessionRevoker: SessionRevoker
  ) {}

  public async execute(input: { keyId: string; now: string }): Promise<{ revokedSessions: number }> {
    await this.accessKeyRepository.revoke(input.keyId, input.now);
    await this.profileKeyWrapperRepository.revokeByKeyId(input.keyId, input.now);
    const revokedSessions = this.sessionRevoker.revokeByKeyId(input.keyId, input.now);
    return { revokedSessions };
  }
}
