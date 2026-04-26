import type { SqliteClient } from '../sqlite-client.js';

export type ProfileKeyWrapperRecord = {
  profileId: string;
  keyId: string;
  encryptedDek: Uint8Array;
  wrapSalt: string;
  kekVersion: number;
  wrapperStatus: 'active' | 'revoked' | 'rotating';
  createdAt: string;
  revokedAt: string | null;
};

export class ProfileKeyWrapperRepository {
  public constructor(private readonly client: SqliteClient) {}

  public async upsert(record: ProfileKeyWrapperRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO profile_key_wrappers(profile_id, key_id, encrypted_dek, wrap_salt, kek_version, wrapper_status, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, key_id)
       DO UPDATE SET encrypted_dek = excluded.encrypted_dek,
                     wrap_salt = excluded.wrap_salt,
                     kek_version = excluded.kek_version,
                     wrapper_status = excluded.wrapper_status,
                     revoked_at = excluded.revoked_at`,
      [
        record.profileId,
        record.keyId,
        record.encryptedDek,
        record.wrapSalt,
        record.kekVersion,
        record.wrapperStatus,
        record.createdAt,
        record.revokedAt
      ]
    );
  }
}
