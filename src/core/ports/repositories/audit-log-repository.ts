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

export interface AuditLogRepository {
  append(entry: AuditLogEntry): Promise<void>;
}
