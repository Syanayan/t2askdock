import type { ProfileKeyWrapperRepository as ProfileKeyWrapperRepositoryPort } from '../../../core/ports/repositories/profile-key-wrapper-repository.js';
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

export class ProfileKeyWrapperRepository implements ProfileKeyWrapperRepositoryPort {
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

  public async findActiveByProfileAndKeyId(profileId: string, keyId: string): Promise<ProfileKeyWrapperRecord | null> {
    const row = await this.client.get<ProfileKeyWrapperRecord>(
      `SELECT profile_id AS profileId,
              key_id AS keyId,
              encrypted_dek AS encryptedDek,
              wrap_salt AS wrapSalt,
              kek_version AS kekVersion,
              wrapper_status AS wrapperStatus,
              created_at AS createdAt,
              revoked_at AS revokedAt
         FROM profile_key_wrappers
        WHERE profile_id = ?
          AND key_id = ?
          AND wrapper_status = 'active'
          AND revoked_at IS NULL`,
      [profileId, keyId]
    );
    return row ?? null;
  }

}
