import type { AccessKeyRepository as AccessKeyRepositoryPort } from '../../../core/ports/repositories/access-key-repository.js';
import type { SqliteClient } from '../sqlite-client.js';

export type AccessKeyRecord = {
  keyId: string;
  ownerType: 'user' | 'device';
  issuedFor: string;
  keyHash: string;
  keySalt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  issuedBy: string;
  issuedAt: string;
};

export class AccessKeyRepository implements AccessKeyRepositoryPort {
  public constructor(private readonly client: SqliteClient) {}

  public async save(record: AccessKeyRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO access_keys(key_id, owner_type, issued_for, key_hash, key_salt, expires_at, revoked_at, issued_by, issued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.keyId,
        record.ownerType,
        record.issuedFor,
        record.keyHash,
        record.keySalt,
        record.expiresAt,
        record.revokedAt,
        record.issuedBy,
        record.issuedAt
      ]
    );
  }

  public async revoke(keyId: string, revokedAt: string): Promise<void> {
    await this.client.run(
      `UPDATE access_keys
       SET revoked_at = ?
       WHERE key_id = ? AND revoked_at IS NULL`,
      [revokedAt, keyId]
    );
  }

  public async findByKeyId(keyId: string): Promise<AccessKeyRecord | null> {
    const row = await this.client.get<AccessKeyRecord>(
      `SELECT key_id AS keyId,
              owner_type AS ownerType,
              issued_for AS issuedFor,
              key_hash AS keyHash,
              key_salt AS keySalt,
              expires_at AS expiresAt,
              revoked_at AS revokedAt,
              issued_by AS issuedBy,
              issued_at AS issuedAt
         FROM access_keys
        WHERE key_id = ?`,
      [keyId]
    );
    return row ?? null;
  }

}
