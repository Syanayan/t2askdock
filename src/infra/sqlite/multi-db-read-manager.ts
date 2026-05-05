import { ActiveClientHolder } from './active-client-holder.js';
import { BetterSqlite3Client } from './better-sqlite3-client.js';
import { TaskRepository } from './repositories/task-repository.js';
import type { DatabaseProfileRepository } from './repositories/database-profile-repository.js';
import type { OsFileAccessChecker } from '../../core/ports/services/os-file-access-checker.js';

type ConnectionEntry = {
  client: BetterSqlite3Client;
  repo: TaskRepository;
};

type ProfileState = {
  profileId: string;
  name: string;
  path: string;
  available: boolean;
};

export class MultiDbReadManager {
  private readonly connections = new Map<string, ConnectionEntry>();
  private profiles: ProfileState[] = [];

  public constructor(
    private readonly profileRepository: Pick<DatabaseProfileRepository, 'findAll'>,
    private readonly osFileAccessChecker: Pick<OsFileAccessChecker, 'check'>
  ) {}

  public async refresh(): Promise<void> {
    const profiles = await this.profileRepository.findAll();
    const profileIds = new Set(profiles.map(profile => profile.profileId));

    for (const [profileId, connection] of this.connections.entries()) {
      if (!profileIds.has(profileId)) {
        connection.client.close();
        this.connections.delete(profileId);
      }
    }

    this.profiles = [];
    for (const profile of profiles) {
      const access = await this.osFileAccessChecker.check(profile.path);
      const available = access.exists && access.readable;
      this.profiles.push({ profileId: profile.profileId, name: profile.name, path: profile.path, available });
      if (!available) {
        continue;
      }
      if (!this.connections.has(profile.profileId)) {
        const client = new BetterSqlite3Client(profile.path);
        const repo = new TaskRepository(new ActiveClientHolder(client));
        this.connections.set(profile.profileId, { client, repo });
      }
    }
  }

  public getRepo(profileId: string): TaskRepository | undefined {
    return this.connections.get(profileId)?.repo;
  }

  public getClient(profileId: string): BetterSqlite3Client | undefined {
    return this.connections.get(profileId)?.client;
  }

  public getProfiles(): ProfileState[] {
    return [...this.profiles];
  }

  public closeAll(): void {
    for (const entry of this.connections.values()) {
      entry.client.close();
    }
    this.connections.clear();
  }
}
