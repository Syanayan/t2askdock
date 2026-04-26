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

  public async findByConnectorAndProfile(connectorId: string, profileId: string): Promise<ConnectorSettingsRecord | null> {
    const row = await this.client.get<ConnectorSettingsRecord>(
      `SELECT connector_id AS connectorId,
              profile_id AS profileId,
              enabled AS enabled,
              auth_type AS authType,
              settings_json AS settingsJson,
              secret_ref AS secretRef,
              sync_policy AS syncPolicy,
              updated_by AS updatedBy,
              updated_at AS updatedAt
         FROM connector_settings
        WHERE connector_id = ?
          AND profile_id = ?`,
      [connectorId, profileId]
    );

    return row === null || row === undefined
      ? null
      : { ...row, enabled: row.enabled === true || row.enabled === 1 };
  }

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
