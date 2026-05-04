import type {
  AuditLogEntry,
  AuditLogRepository as AuditLogRepositoryPort
} from '../../../core/ports/repositories/audit-log-repository.js';
import type { ActiveClientHolder } from '../active-client-holder.js';

export class AuditLogRepository implements AuditLogRepositoryPort {
  public constructor(private readonly holder: ActiveClientHolder) {}

  public async append(entry: AuditLogEntry): Promise<void> {
    await this.holder.get().run(
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
