import type {
  AccessKeyRecord,
  AccessKeyRepository as AccessKeyRepositoryPort
} from '../../../core/ports/repositories/access-key-repository.js';
import type { SqliteClient } from '../sqlite-client.js';

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

  public async findByKeyId(keyId: string): Promise<AccessKeyRecord | undefined> {
    return this.client.get<AccessKeyRecord>(
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
  }
}
