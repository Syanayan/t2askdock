import { ERROR_CODES } from '../../errors/error-codes.js';
import type { OsFileAccessChecker } from '../../ports/services/os-file-access-checker.js';

export type DatabaseProfileReader = {
  findById(profileId: string): Promise<{ profileId: string; name: string; mode: 'readWrite' | 'readOnly'; path: string } | null>;
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
    private readonly connectionHealthChecker: ConnectionHealthChecker,
    private readonly osFileAccessChecker: OsFileAccessChecker
  ) {}

  public async execute(input: { profileId: string }): Promise<{
    profileSummary: { profileId: string; name: string; path: string };
    connectionMode: 'readWrite' | 'readOnly';
    healthStatus: 'healthy' | 'degraded' | 'unreachable';
  }> {
    const profile = await this.databaseProfileRepository.findById(input.profileId);
    if (profile === null) {
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const fileAccess = await this.osFileAccessChecker.check(profile.path);
    if (!fileAccess.exists || !fileAccess.readable || !fileAccess.writable) {
      throw new Error(ERROR_CODES.ACCESS_DENIED);
    }

    if (!this.authStateReader.isAuthenticated(input.profileId)) {
      throw new Error(ERROR_CODES.AUTH_FAILED);
    }

    const healthStatus = await this.connectionHealthChecker.check(input.profileId);
    return {
      profileSummary: { profileId: profile.profileId, name: profile.name, path: profile.path },
      connectionMode: profile.mode,
      healthStatus
    };
  }
}
