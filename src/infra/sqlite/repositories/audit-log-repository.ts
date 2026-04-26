import type { SqliteClient } from '../sqlite-client.js';

export type AuditLogEntry = {
  logId: string;
  actorId: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  payloadDiffJson: string;
  retentionClass: string;
  createdAt: string;
};

export class AuditLogRepository {
  public constructor(private readonly client: SqliteClient) {}

  public async append(entry: AuditLogEntry): Promise<void> {
    await this.client.run(
      `INSERT INTO audit_logs(log_id, actor_id, action_type, target_type, target_id, payload_diff_json, retention_class, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.logId,
        entry.actorId,
        entry.actionType,
        entry.targetType,
        entry.targetId,
        entry.payloadDiffJson,
        entry.retentionClass,
        entry.createdAt
      ]
    );
  }
}
