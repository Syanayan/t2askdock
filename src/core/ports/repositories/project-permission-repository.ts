export type ProjectPermissionGrant = {
  grantId: string;
  projectId: string;
  userId: string;
  canEdit: boolean;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string | null;
};

export interface ProjectPermissionRepository {
  grant(record: ProjectPermissionGrant): Promise<void>;
  revoke(grantId: string, revokedAt: string, revokedBy: string): Promise<void>;
  expireDuePermissions(nowIso: string): Promise<number>;
}
