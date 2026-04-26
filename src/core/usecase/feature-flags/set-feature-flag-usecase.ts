export type FeatureFlagWriter = {
  upsert(input: {
    flagKey: string;
    enabled: boolean;
    scopeType: 'global' | 'profile' | 'user';
    scopeId: string | null;
    updatedBy: string;
    updatedAt: string;
  }): Promise<void>;
};

export class SetFeatureFlagUseCase {
  public constructor(private readonly featureFlagRepository: FeatureFlagWriter) {}

  public async execute(input: {
    flagKey: string;
    enabled: boolean;
    scopeType: 'global' | 'profile' | 'user';
    scopeId: string | null;
    updatedBy: string;
    now: string;
  }): Promise<void> {
    await this.featureFlagRepository.upsert({
      flagKey: input.flagKey,
      enabled: input.enabled,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      updatedBy: input.updatedBy,
      updatedAt: input.now
    });
  }
}
