import { ERROR_CODES } from '../../errors/error-codes.js';
import type { SecretStorageService } from '../../ports/services/secret-storage-service.js';

export class UnmountDatabaseUseCase {
  public constructor(private readonly repository: { delete(profileId: string): Promise<void> }, private readonly secretStorageService: SecretStorageService) {}
  public async execute(input: { profileId: string; actorRole: 'admin' | 'general' }): Promise<void> {
    if (input.actorRole !== 'admin') throw new Error(ERROR_CODES.FORBIDDEN);
    await this.repository.delete(input.profileId);
    await this.secretStorageService.deleteMountKey(input.profileId);
  }
}
