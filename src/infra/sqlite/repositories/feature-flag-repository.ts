import type { ActiveClientHolder } from '../active-client-holder.js';

export type FeatureFlagRecord = {
  flagKey: string;
  enabled: boolean;
  scopeType: 'global' | 'profile' | 'user';
  scopeId: string | null;
  updatedBy: string;
  updatedAt: string;
};

export class FeatureFlagRepository {
  public constructor(private readonly holder: ActiveClientHolder) {}

  public async upsert(record: FeatureFlagRecord): Promise<void> {
    await this.holder.get().run(
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
