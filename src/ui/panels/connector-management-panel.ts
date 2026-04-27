import { ERROR_CODES } from '../../core/errors/error-codes.js';
import type { RotateConnectorSecretUseCase } from '../../core/usecase/connector/rotate-connector-secret-usecase.js';
import type { UpdateConnectorSettingsUseCase } from '../../core/usecase/connector/update-connector-settings-usecase.js';

export class ConnectorManagementPanel {
  public constructor(
    private readonly updateConnectorSettingsUseCase: UpdateConnectorSettingsUseCase,
    private readonly rotateConnectorSecretUseCase: RotateConnectorSecretUseCase
  ) {}

  public async updateSettings(input: {
    connectorId: string;
    profileId: string;
    actorId: string;
    authType: string;
    settingsJson: string;
    secretRef: string | null;
    syncPolicy: 'manual' | 'scheduled';
    now: string;
  }): Promise<{ enabled: boolean }> {
    return this.updateConnectorSettingsUseCase.execute(input);
  }

  public async rotateSecret(input: {
    connectorId: string;
    profileId: string;
    updatedBy: string;
    now: string;
  }): Promise<{ secretRef: string; hasMismatch: boolean }> {
    try {
      const output = await this.rotateConnectorSecretUseCase.execute(input);
      return { secretRef: output.secretRef, hasMismatch: false };
    } catch (error) {
      if (error instanceof Error && error.message === ERROR_CODES.CONNECTOR_SECRET_MISSING) {
        return { secretRef: 'missing', hasMismatch: true };
      }

      throw error;
    }
  }
}
