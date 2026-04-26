import type { SqliteClient } from '../sqlite-client.js';

export type DatabaseProfileRecord = {
  profileId: string;
  name: string;
  path: string;
  mode: 'readWrite' | 'readOnly';
  encryptedDek: Uint8Array;
  dekWrapSalt: string;
};

export class DatabaseProfileRepository {
  public constructor(private readonly client: SqliteClient) {}

  public async save(record: DatabaseProfileRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO db_profiles(profile_id, name, path, mode, encrypted_dek, dek_wrap_salt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.profileId, record.name, record.path, record.mode, record.encryptedDek, record.dekWrapSalt]
    );
  }
}
