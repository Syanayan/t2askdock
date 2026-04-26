import type { SqliteClient } from '../sqlite-client.js';

export type ConnectorSettingsRecord = {
  connectorId: string;
  profileId: string;
  enabled: boolean;
  authType: string;
  settingsJson: string;
  secretRef: string | null;
  syncPolicy: 'manual' | 'scheduled';
  updatedBy: string;
  updatedAt: string;
};

export class ConnectorSettingsRepository {
  public constructor(private readonly client: SqliteClient) {}

  public async upsert(record: ConnectorSettingsRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO connector_settings(connector_id, profile_id, enabled, auth_type, settings_json, secret_ref, sync_policy, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(connector_id, profile_id)
       DO UPDATE SET enabled = excluded.enabled,
                     auth_type = excluded.auth_type,
                     settings_json = excluded.settings_json,
                     secret_ref = excluded.secret_ref,
                     sync_policy = excluded.sync_policy,
                     updated_by = excluded.updated_by,
                     updated_at = excluded.updated_at`,
      [
        record.connectorId,
        record.profileId,
        record.enabled ? 1 : 0,
        record.authType,
        record.settingsJson,
        record.secretRef,
        record.syncPolicy,
        record.updatedBy,
        record.updatedAt
      ]
    );
  }
}
