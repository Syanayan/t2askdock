import type { SqliteClient } from '../sqlite-client.js';

export class ProjectPermissionRepository {
  public constructor(private readonly client: SqliteClient) {}

  public async grant(record: {
    grantId: string;
    projectId: string;
    userId: string;
    canEdit: boolean;
    grantedBy: string;
    grantedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
  }): Promise<void> {
    await this.client.run(
      `INSERT INTO project_permissions(grant_id, project_id, user_id, can_edit, granted_by, granted_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.grantId,
        record.projectId,
        record.userId,
        record.canEdit ? 1 : 0,
        record.grantedBy,
        record.grantedAt,
        record.expiresAt,
        record.revokedAt
      ]
    );
  }

  public async revokeActiveGrant(projectId: string, userId: string, revokedAt: string): Promise<void> {
    await this.client.run(
      `UPDATE project_permissions
       SET revoked_at = ?
       WHERE project_id = ? AND user_id = ? AND revoked_at IS NULL`,
      [revokedAt, projectId, userId]
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
