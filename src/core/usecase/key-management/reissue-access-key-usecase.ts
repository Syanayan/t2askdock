import { IssueAccessKeyUseCase } from './issue-access-key-usecase.js';
import { RevokeAccessKeyUseCase } from './revoke-access-key-usecase.js';

export class ReissueAccessKeyUseCase {
  public constructor(
    private readonly revokeAccessKeyUseCase: Pick<RevokeAccessKeyUseCase, 'execute'>,
    private readonly issueAccessKeyUseCase: Pick<IssueAccessKeyUseCase, 'execute'>
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
    await this.revokeAccessKeyUseCase.execute({ keyId: input.oldKeyId, now: input.now });
    return this.issueAccessKeyUseCase.execute({
      ownerType: input.ownerType,
      issuedFor: input.issuedFor,
      profileIds: input.profileIds,
      expiresAt: input.expiresAt,
      issuedBy: input.issuedBy,
      now: input.now
    });
  }
}
