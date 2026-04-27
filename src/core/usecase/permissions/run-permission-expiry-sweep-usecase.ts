export type ProjectPermissionExpirer = {
  expireDuePermissions(nowIso: string): Promise<number>;
};

export class RunPermissionExpirySweepUseCase {
  public constructor(private readonly projectPermissionRepository: ProjectPermissionExpirer) {}

  public async execute(input: { now: string }): Promise<{ expiredCount: number }> {
    const expiredCount = await this.projectPermissionRepository.expireDuePermissions(input.now);
    return { expiredCount };
  }
}
