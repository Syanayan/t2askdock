import { ERROR_CODES } from '../../errors/error-codes.js';

export type DatabaseProfileModeWriter = {
  setMode(profileId: string, mode: 'readWrite' | 'readOnly'): Promise<void>;
};

export class SetReadOnlyModeUseCase {
  public constructor(private readonly databaseProfileRepository: DatabaseProfileModeWriter) {}

  public async execute(input: {
    profileId: string;
    enabled: boolean;
    actorRole: 'admin' | 'general';
  }): Promise<{ mode: 'readWrite' | 'readOnly' }> {
    if (input.actorRole === 'general' && !input.enabled) {
      throw new Error(ERROR_CODES.PERMISSION_DENIED);
    }

    const mode: 'readWrite' | 'readOnly' = input.enabled ? 'readOnly' : 'readWrite';
    await this.databaseProfileRepository.setMode(input.profileId, mode);
    return { mode };
  }
}
