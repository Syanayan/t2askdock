import { ERROR_CODES } from '../../errors/error-codes.js';

export type DatabaseProfileReader = {
  findById(profileId: string): Promise<{ profileId: string; mode: 'readWrite' | 'readOnly'; path: string } | null>;
};

export type AuthStateReader = {
  isAuthenticated(profileId: string): boolean;
};

export type ConnectionHealthChecker = {
  check(profileId: string): Promise<'healthy' | 'degraded' | 'unreachable'>;
};

export class SwitchDatabaseProfileUseCase {
  public constructor(
    private readonly databaseProfileRepository: DatabaseProfileReader,
    private readonly authStateReader: AuthStateReader,
    private readonly connectionHealthChecker: ConnectionHealthChecker
  ) {}

  public async execute(input: { profileId: string }): Promise<{
    profileSummary: { profileId: string; path: string };
    connectionMode: 'readWrite' | 'readOnly';
    healthStatus: 'healthy' | 'degraded' | 'unreachable';
  }> {
    const profile = await this.databaseProfileRepository.findById(input.profileId);
    if (profile === null || !this.authStateReader.isAuthenticated(input.profileId)) {
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const healthStatus = await this.connectionHealthChecker.check(input.profileId);
    return {
      profileSummary: { profileId: profile.profileId, path: profile.path },
      connectionMode: profile.mode,
      healthStatus
    };
  }
}
