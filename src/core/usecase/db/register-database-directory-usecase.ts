import { basename, join } from 'node:path';
import { ERROR_CODES } from '../../errors/error-codes.js';
import type { OsFileAccessChecker } from '../../ports/services/os-file-access-checker.js';
import type { SecretStorageService } from '../../ports/services/secret-storage-service.js';

export class RegisterDatabaseDirectoryUseCase {
  public constructor(
    private readonly databaseProfileRepository: { save(input: any): Promise<void>; findAll?(): Promise<Array<{ path: string }>> },
    private readonly osFileAccessChecker: OsFileAccessChecker,
    private readonly secretStorageService: SecretStorageService,
    private readonly idGenerator: { nextUlid(): string }
  ) {}

  public async execute(input: { directoryPath: string; actorRole: 'admin' | 'general' }): Promise<{ registeredProfiles: Array<{ profileId: string; path: string }> }> {
    if (input.actorRole !== 'admin') throw new Error(ERROR_CODES.FORBIDDEN);
    const dir = await this.osFileAccessChecker.checkDirectory(input.directoryPath);
    if (!dir.exists || !dir.readable) throw new Error(ERROR_CODES.FILE_NOT_FOUND);

    const sqliteFiles = await this.osFileAccessChecker.listSqliteFiles(input.directoryPath);
    const registeredProfiles: Array<{ profileId: string; path: string }> = [];
    for (const filePath of sqliteFiles) {
      const access = await this.osFileAccessChecker.check(filePath);
      if (!access.exists || !access.readable) continue;
      const profileId = this.idGenerator.nextUlid();
      await this.databaseProfileRepository.save({
        profileId,
        name: basename(filePath),
        path: join(input.directoryPath, basename(filePath)),
        mode: 'readWrite',
        isDefault: false,
        lastConnectedAt: null,
        mountSource: 'directory',
        accessAllowed: true,
        encryptedDek: new Uint8Array([1]),
        dekWrapSalt: 'salt'
      });
      registeredProfiles.push({ profileId, path: filePath });
    }

    await this.secretStorageService.saveDirectoryRegistration(input.directoryPath);
    return { registeredProfiles };
  }
}
