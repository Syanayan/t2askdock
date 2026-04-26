import type { SqliteClient } from '../sqlite-client.js';

export class ProjectPermissionRepository {
  public constructor(private readonly client: SqliteClient) {}

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
