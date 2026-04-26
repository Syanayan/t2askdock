import type { IdGenerator } from '../../ports/services/id-generator.js';

export type ProjectPermissionWriter = {
  revokeActiveGrant(projectId: string, userId: string, revokedAt: string): Promise<void>;
  grant(input: {
    grantId: string;
    projectId: string;
    userId: string;
    canEdit: boolean;
    grantedBy: string;
    grantedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
  }): Promise<void>;
};

export class GrantProjectEditPermissionUseCase {
  public constructor(
    private readonly projectPermissionRepository: ProjectPermissionWriter,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: {
    projectId: string;
    userId: string;
    canEdit: boolean;
    expiresAt: string | null;
    grantedBy: string;
    now: string;
  }): Promise<{ grantId: string }> {
    await this.projectPermissionRepository.revokeActiveGrant(input.projectId, input.userId, input.now);
    const grantId = this.idGenerator.nextUlid();
    await this.projectPermissionRepository.grant({
      grantId,
      projectId: input.projectId,
      userId: input.userId,
      canEdit: input.canEdit,
      grantedBy: input.grantedBy,
      grantedAt: input.now,
      expiresAt: input.expiresAt,
      revokedAt: null
    });
    return { grantId };
  }
}
