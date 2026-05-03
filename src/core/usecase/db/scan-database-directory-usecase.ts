import type { OsFileAccessChecker } from '../../ports/services/os-file-access-checker.js';
import type { UiEventBus } from '../../../ui/events/ui-event-bus.js';

export class ScanDatabaseDirectoryUseCase {
  public constructor(
    private readonly databaseProfileRepository: { findAll(): Promise<Array<{ path: string; mountSource: 'individual' | 'directory'; accessAllowed: boolean }>> },
    private readonly osFileAccessChecker: OsFileAccessChecker,
    private readonly uiEventBus: Pick<UiEventBus, 'publish'>
  ) {}

  public async execute(): Promise<{ scanResult: { added: string[]; removed: string[]; permissionChanged: string[] } }> {
    const profiles = await this.databaseProfileRepository.findAll();
    const directoryProfiles = profiles.filter((p) => p.mountSource === 'directory');
    const added: string[] = [];
    const removed: string[] = [];
    const permissionChanged: string[] = [];

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
