import type {
  ProjectPermissionGrant,
  ProjectPermissionRepository as ProjectPermissionRepositoryPort
} from '../../../core/ports/repositories/project-permission-repository.js';
import type { SqliteClient } from '../sqlite-client.js';

export class ProjectPermissionRepository implements ProjectPermissionRepositoryPort {
  public constructor(private readonly client: SqliteClient) {}

  public async grant(record: ProjectPermissionGrant): Promise<void> {
    await this.client.run(
      `INSERT INTO project_permissions(grant_id, project_id, user_id, can_edit, granted_by, granted_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        record.grantId,
        record.projectId,
        record.userId,
        record.canEdit ? 1 : 0,
        record.grantedBy,
        record.grantedAt,
        record.expiresAt
      ]
    );
  }

  public async revoke(grantId: string, revokedAt: string, _revokedBy: string): Promise<void> {
    await this.client.run(
      `UPDATE project_permissions
       SET revoked_at = ?
       WHERE grant_id = ? AND revoked_at IS NULL`,
      [revokedAt, grantId]
    );
  }

  public async expireDuePermissions(nowIso: string): Promise<number> {
    const result = await this.client.run(
      `UPDATE project_permissions
       SET revoked_at = ?
       WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at < ?`,
      [nowIso, nowIso]
    );

    return result.changes;
  }
}
