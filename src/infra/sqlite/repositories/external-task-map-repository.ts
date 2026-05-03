import type { SqliteClient } from '../sqlite-client.js';

export type ExternalTaskMapRecord = {
  connectorId: string;
  externalId: string;
  taskId: string;
  syncedAt: string;
};

export class ExternalTaskMapRepository {
  public constructor(private readonly client: SqliteClient) {}

  public async findByExternalId(connectorId: string, externalId: string): Promise<ExternalTaskMapRecord | null> {
    const row = await this.client.get<ExternalTaskMapRecord>(
      `SELECT connector_id AS connectorId,
              external_id AS externalId,
              task_id AS taskId,
              synced_at AS syncedAt
         FROM external_task_map
        WHERE connector_id = ?
          AND external_id = ?`,
      [connectorId, externalId]
    );

    return row ?? null;
  }

  public async upsert(record: ExternalTaskMapRecord): Promise<void> {
    await this.client.run(
      `INSERT INTO external_task_map(connector_id, external_id, task_id, synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(connector_id, external_id)
       DO UPDATE SET task_id = excluded.task_id,
                     synced_at = excluded.synced_at`,
      [record.connectorId, record.externalId, record.taskId, record.syncedAt]
    );
  }
}
