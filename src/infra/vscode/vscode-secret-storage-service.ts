import type * as vscode from 'vscode';
import type { SecretStorageService } from '../../core/ports/services/secret-storage-service.js';

const DIR_KEY = 't2askdock.dirRegistrations';

export class VscodeSecretStorageService implements SecretStorageService {
  public constructor(private readonly secrets: vscode.SecretStorage) {}

  public async saveMountKey(profileId: string, keyRef: string): Promise<void> {
    await this.secrets.store(`t2askdock.mountKey.${profileId}`, keyRef);
  }

  public async deleteMountKey(profileId: string): Promise<void> {
    await this.secrets.delete(`t2askdock.mountKey.${profileId}`);
  }

  public async getMountKey(profileId: string): Promise<string | null> {
    return (await this.secrets.get(`t2askdock.mountKey.${profileId}`)) ?? null;
  }

  public async saveDirectoryRegistration(dirPath: string): Promise<void> {
    const all = await this.getDirectoryRegistrations();
    if (!all.includes(dirPath)) {
      await this.secrets.store(DIR_KEY, JSON.stringify([...all, dirPath]));
    }
  }

  public async getDirectoryRegistrations(): Promise<string[]> {
    const raw = await this.secrets.get(DIR_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  public async deleteDirectoryRegistration(dirPath: string): Promise<void> {
    const all = await this.getDirectoryRegistrations();
    await this.secrets.store(DIR_KEY, JSON.stringify(all.filter((v) => v !== dirPath)));
  }
}
