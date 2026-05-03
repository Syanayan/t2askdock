import type { SqliteClient } from '../sqlite-client.js';

export type DatabaseProfileRecord = {
  profileId: string;
  name: string;
  path: string;
  mode: 'readWrite' | 'readOnly';
  isDefault: boolean;
  lastConnectedAt: string | null;
  mountSource: 'individual' | 'directory';
  accessAllowed: boolean;
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
              is_default AS isDefault,
              last_connected_at AS lastConnectedAt,
              mount_source AS mountSource,
              encrypted_dek AS encryptedDek,
              dek_wrap_salt AS dekWrapSalt
         FROM db_profiles
        WHERE profile_id = ?`,
      [profileId]
    );
    return row ? { ...row, accessAllowed: true } : null;
  }

  public async findAll(): Promise<DatabaseProfileRecord[]> {
    const rows = await this.client.all<DatabaseProfileRecord>(`SELECT profile_id AS profileId,
              name AS name,
              path AS path,
              mode AS mode,
              is_default AS isDefault,
              last_connected_at AS lastConnectedAt,
              mount_source AS mountSource,
              encrypted_dek AS encryptedDek,
              dek_wrap_salt AS dekWrapSalt
         FROM db_profiles`);
    return rows.map((row) => ({ ...row, accessAllowed: true }));
  }

  public async delete(profileId: string): Promise<void> {
    await this.client.run('DELETE FROM db_profiles WHERE profile_id = ?', [profileId]);
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
      `INSERT INTO db_profiles(profile_id, name, path, mode, is_default, last_connected_at, mount_source, encrypted_dek, dek_wrap_salt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.profileId, record.name, record.path, record.mode, record.isDefault ? 1 : 0, record.lastConnectedAt, record.mountSource, record.encryptedDek, record.dekWrapSalt]
    );
  }
}
