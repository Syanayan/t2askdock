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

  public async findById(profileId: string): Promise<DatabaseProfileRecord | null> {
    const row = await this.client.get<DatabaseProfileRecord>(
      `SELECT profile_id AS profileId,
              name AS name,
              path AS path,
              mode AS mode,
              encrypted_dek AS encryptedDek,
              dek_wrap_salt AS dekWrapSalt
         FROM db_profiles
        WHERE profile_id = ?`,
      [profileId]
    );
    return row ?? null;
  }

  public async setMode(profileId: string, mode: 'readWrite' | 'readOnly'): Promise<void> {
    await this.client.run(
      `UPDATE db_profiles
       SET mode = ?
       WHERE profile_id = ?`,
      [mode, profileId]
    );
  }

  public async save(record: DatabaseProfileRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO db_profiles(profile_id, name, path, mode, encrypted_dek, dek_wrap_salt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.profileId, record.name, record.path, record.mode, record.encryptedDek, record.dekWrapSalt]
    );
  }
}
