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

export class AccessKeyRepository {
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
}
