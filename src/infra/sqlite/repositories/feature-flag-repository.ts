import type {
  FeatureFlagRecord,
  FeatureFlagRepository as FeatureFlagRepositoryPort
} from '../../../core/ports/repositories/feature-flag-repository.js';
import type { SqliteClient } from '../sqlite-client.js';

export class FeatureFlagRepository implements FeatureFlagRepositoryPort {
  public constructor(private readonly client: SqliteClient) {}

  public async upsert(record: FeatureFlagRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO feature_flags(flag_key, enabled, scope_type, scope_id, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(flag_key)
       DO UPDATE SET enabled = excluded.enabled,
                     scope_type = excluded.scope_type,
                     scope_id = excluded.scope_id,
                     updated_by = excluded.updated_by,
                     updated_at = excluded.updated_at`,
      [record.flagKey, record.enabled ? 1 : 0, record.scopeType, record.scopeId, record.updatedBy, record.updatedAt]
    );
  }
}
