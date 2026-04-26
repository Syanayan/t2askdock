import { ERROR_CODES } from '../../errors/error-codes.js';

export type ConnectorSettingsReaderWriter = {
  findByConnectorAndProfile(connectorId: string, profileId: string): Promise<{
    connectorId: string;
    profileId: string;
    enabled: boolean;
    authType: string;
    settingsJson: string;
    secretRef: string | null;
    syncPolicy: 'manual' | 'scheduled';
  } | null>;
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

export type SecretRefGenerator = {
  nextSecretRef(): string;
};

export class RotateConnectorSecretUseCase {
  public constructor(
    private readonly connectorSettingsRepository: ConnectorSettingsReaderWriter,
    private readonly secretRefGenerator: SecretRefGenerator
  ) {}

  public async execute(input: { connectorId: string; profileId: string; updatedBy: string; now: string }): Promise<{ secretRef: string }> {
    const current = await this.connectorSettingsRepository.findByConnectorAndProfile(input.connectorId, input.profileId);
    if (current === null) {
      throw new Error(ERROR_CODES.CONNECTOR_SECRET_MISSING);
    }

    const secretRef = this.secretRefGenerator.nextSecretRef();
    await this.connectorSettingsRepository.upsert({
      ...current,
      secretRef,
      updatedBy: input.updatedBy,
      updatedAt: input.now
    });

    return { secretRef };
  }
}
