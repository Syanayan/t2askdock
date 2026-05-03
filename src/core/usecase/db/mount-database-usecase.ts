import { ERROR_CODES } from '../../errors/error-codes.js';
import type { OsFileAccessChecker } from '../../ports/services/os-file-access-checker.js';
import type { SecretStorageService } from '../../ports/services/secret-storage-service.js';

export class MountDatabaseUseCase {
  public constructor(
    private readonly repository: { save(input: any): Promise<void> },
    private readonly osFileAccessChecker: OsFileAccessChecker,
    private readonly connectionHealthChecker: { check(profileId: string): Promise<'healthy' | 'degraded' | 'unreachable'> },
    private readonly secretStorageService: SecretStorageService
  ) {}
  public async execute(input: { path: string; name: string; mode: 'readWrite' | 'readOnly'; actorRole: 'admin' | 'general' }) {
    if (input.actorRole !== 'admin') throw new Error(ERROR_CODES.FORBIDDEN);
    const access = await this.osFileAccessChecker.check(input.path);
    if (!access.exists) throw new Error(ERROR_CODES.FILE_NOT_FOUND);
    if (!access.readable) throw new Error(ERROR_CODES.ACCESS_DENIED);
    const profileId = `profile-${Date.now()}`;
    await this.connectionHealthChecker.check(profileId);
    await this.repository.save({ profileId, name: input.name, path: input.path, mode: input.mode, isDefault: false, lastConnectedAt: null, mountSource: 'individual', accessAllowed: true, encryptedDek: new Uint8Array([1]), dekWrapSalt: 'salt' });
    await this.secretStorageService.saveMountKey(profileId, `mount-key:${profileId}`);
    return { profileSummary: { profileId, name: input.name, path: input.path, mountSource: 'individual' as const } };
  }
}
