import type { UserProps } from '../entities/user.js';
import type { TaskProps } from '../entities/task.js';

export type ConnectionMode = 'READ_WRITE' | 'READ_ONLY';

export type ProjectPermissionGrant = {
  projectId: string;
  userId: string;
  canEdit: boolean;
  revokedAt: string | null;
};

export type AuthorizationResult = {
  allow: boolean;
  reasonCode: 'ALLOW' | 'READ_ONLY' | 'USER_DISABLED' | 'PERMISSION_DENIED';
};

export class AuthorizeTaskEditPolicy {
  public evaluate(input: {
    currentUser: UserProps;
    task: TaskProps;
    projectPermissionGrants: ProjectPermissionGrant[];
    connectionMode: ConnectionMode;
  }): AuthorizationResult {
    if (input.connectionMode === 'READ_ONLY') {
      return { allow: false, reasonCode: 'READ_ONLY' };
    }

    if (input.currentUser.status !== 'active') {
      return { allow: false, reasonCode: 'USER_DISABLED' };
    }

    if (input.currentUser.role === 'admin') {
      return { allow: true, reasonCode: 'ALLOW' };
    }

    if (input.task.assignee === input.currentUser.userId || input.task.createdBy === input.currentUser.userId) {
      return { allow: true, reasonCode: 'ALLOW' };
    }

    const canEditByGrant = input.projectPermissionGrants.some(
      (grant) =>
        grant.projectId === input.task.projectId &&
        grant.userId === input.currentUser.userId &&
        grant.canEdit &&
        grant.revokedAt === null
    );

    if (canEditByGrant) {
      return { allow: true, reasonCode: 'ALLOW' };
    }

    return { allow: false, reasonCode: 'PERMISSION_DENIED' };
  }
}
