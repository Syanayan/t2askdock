import type { OsFileAccessChecker } from '../../ports/services/os-file-access-checker.js';
import type { UiEventBus } from '../../../ui/events/ui-event-bus.js';
import type { SecretStorageService } from '../../ports/services/secret-storage-service.js';

export class ScanDatabaseDirectoryUseCase {
  public constructor(
    private readonly databaseProfileRepository: { findAll(): Promise<Array<{ path: string; mountSource: 'individual' | 'directory'; accessAllowed: boolean }>> },
    private readonly osFileAccessChecker: OsFileAccessChecker,
    private readonly secretStorageService: SecretStorageService,
    private readonly uiEventBus: Pick<UiEventBus, 'publish'>
  ) {}

  public async execute(): Promise<{ scanResult: { added: string[]; removed: string[]; permissionChanged: string[] } }> {
    const profiles = await this.databaseProfileRepository.findAll();
    const directoryProfiles = profiles.filter((p) => p.mountSource === 'directory');
    const knownPaths = new Set(directoryProfiles.map((p) => p.path));
    const added: string[] = [];
    const removed: string[] = [];
    const permissionChanged: string[] = [];

    const directories = await this.secretStorageService.getDirectoryRegistrations();
    for (const dirPath of directories) {
      const files = await this.osFileAccessChecker.listSqliteFiles(dirPath);
      for (const filePath of files) {
        if (!knownPaths.has(filePath)) {
          added.push(filePath);
        }
      }
    }

    for (const profile of directoryProfiles) {
      const access = await this.osFileAccessChecker.check(profile.path);
      if (!access.exists) {
        removed.push(profile.path);
      } else if (profile.accessAllowed !== (access.readable && access.writable)) {
        permissionChanged.push(profile.path);
      }
    }

    const scanResult = { added, removed, permissionChanged };
    this.uiEventBus.publish({ type: 'DATABASE_DIRECTORY_UPDATED', payload: scanResult });
    return { scanResult };
  }
}
