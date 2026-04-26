import type {
  DatabaseProfileRecord,
  DatabaseProfileRepository as DatabaseProfileRepositoryPort
} from '../../../core/ports/repositories/database-profile-repository.js';
import type { SqliteClient } from '../sqlite-client.js';

export class DatabaseProfileRepository implements DatabaseProfileRepositoryPort {
  public constructor(private readonly client: SqliteClient) {}

  public async save(record: DatabaseProfileRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO db_profiles(profile_id, name, path, mode, encrypted_dek, dek_wrap_salt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.profileId, record.name, record.path, record.mode, record.encryptedDek, record.dekWrapSalt]
    );
  }

  public async findById(profileId: string): Promise<DatabaseProfileRecord | undefined> {
    return this.client.get<DatabaseProfileRecord>(
      `SELECT profile_id AS profileId,
              name,
              path,
              mode,
              encrypted_dek AS encryptedDek,
              dek_wrap_salt AS dekWrapSalt
       FROM db_profiles
       WHERE profile_id = ?`,
      [profileId]
    );
  }
}
