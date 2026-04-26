import { ERROR_CODES } from '../errors/error-codes.js';
import type { DatabaseProfileRepository } from '../ports/repositories/database-profile-repository.js';

export type SwitchDatabaseProfileOutput = {
  profileSummary: {
    profileId: string;
    name: string;
    path: string;
  };
  connectionMode: 'READ_WRITE' | 'READ_ONLY';
  healthStatus: 'healthy';
};

export class SwitchDatabaseProfileUseCase {
  public constructor(private readonly databaseProfileRepository: DatabaseProfileRepository) {}

  public async execute(profileId: string): Promise<SwitchDatabaseProfileOutput> {
    const profile = await this.databaseProfileRepository.findById(profileId);
    if (profile === undefined) {
      throw new Error(ERROR_CODES.VALIDATION_FAILED);
    }

    return {
      profileSummary: {
        profileId: profile.profileId,
        name: profile.name,
        path: profile.path
      },
      connectionMode: profile.mode === 'readOnly' ? 'READ_ONLY' : 'READ_WRITE',
      healthStatus: 'healthy'
    };
  }
}
