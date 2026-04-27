export type FeatureFlagResolver = {
  isEnabled(flagKey: string, scope: { profileId: string; userId: string | null }): Promise<boolean>;
};

export type ConnectorSettingsWriter = {
  upsert(input: {
    connectorId: string;
    profileId: string;
    enabled: boolean;
    authType: string;
    settingsJson: string;
    secretRef: string | null;
    syncPolicy: 'manual' | 'scheduled';
    updatedBy: string;
    updatedAt: string;
  }): Promise<void>;
};

export class UpdateConnectorSettingsUseCase {
  public constructor(
    private readonly featureFlagResolver: FeatureFlagResolver,
    private readonly connectorSettingsRepository: ConnectorSettingsWriter
  ) {}

  public async execute(input: {
    connectorId: string;
    profileId: string;
    actorId: string;
    authType: string;
    settingsJson: string;
    secretRef: string | null;
    syncPolicy: 'manual' | 'scheduled';
    now: string;
  }): Promise<{ enabled: boolean }> {
    const enabled = await this.featureFlagResolver.isEnabled(`connector.${input.connectorId}.enabled`, {
      profileId: input.profileId,
      userId: input.actorId
    });

    await this.connectorSettingsRepository.upsert({
      connectorId: input.connectorId,
      profileId: input.profileId,
      enabled,
      authType: input.authType,
      settingsJson: input.settingsJson,
      secretRef: input.secretRef,
      syncPolicy: input.syncPolicy,
      updatedBy: input.actorId,
      updatedAt: input.now
    });

    return { enabled };
  }
}
