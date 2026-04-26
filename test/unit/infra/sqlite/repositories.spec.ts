import { describe, expect, it } from 'vitest';
import { Task } from '../../../../src/core/domain/entities/task.js';
import { ERROR_CODES } from '../../../../src/core/errors/error-codes.js';
import { AccessKeyRepository } from '../../../../src/infra/sqlite/repositories/access-key-repository.js';
import { AuditLogRepository } from '../../../../src/infra/sqlite/repositories/audit-log-repository.js';
import { CommentRepository } from '../../../../src/infra/sqlite/repositories/comment-repository.js';
import { ConnectorSettingsRepository } from '../../../../src/infra/sqlite/repositories/connector-settings-repository.js';
import { DatabaseProfileRepository } from '../../../../src/infra/sqlite/repositories/database-profile-repository.js';
import { FeatureFlagRepository } from '../../../../src/infra/sqlite/repositories/feature-flag-repository.js';
import { ProfileKeyWrapperRepository } from '../../../../src/infra/sqlite/repositories/profile-key-wrapper-repository.js';
import { ProjectPermissionRepository } from '../../../../src/infra/sqlite/repositories/project-permission-repository.js';
import { TaskRepository } from '../../../../src/infra/sqlite/repositories/task-repository.js';
import { FakeSqliteClient } from './fake-client.js';

describe('SQLite repositories (phase2)', () => {
  it('TaskRepository.create inserts task row and tags', async () => {
    const client = new FakeSqliteClient();
    const repository = new TaskRepository(client);

    await repository.create(
      Task.from({
        taskId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
        projectId: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
        title: 'phase3',
        description: null,
        status: 'todo',
        priority: 'medium',
        assignee: null,
        dueDate: null,
        tags: ['Bug', 'UI'],
        parentTaskId: null,
        createdBy: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        updatedBy: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        createdAt: '2026-04-26T00:00:00Z',
        updatedAt: '2026-04-26T00:00:00Z',
        version: 1
      })
    );

    expect(client.executed.filter((item) => item.type === 'run').length).toBe(3);
    expect(client.executed[0]?.sql.includes('INSERT INTO tasks')).toBe(true);
    expect(client.executed[1]?.sql.includes('INSERT INTO task_tags')).toBe(true);
  });

  it('TaskRepository.updateWithVersion throws conflict when no row updated', async () => {
    const client = new FakeSqliteClient();
    client.runResult = { changes: 0 };
    const repository = new TaskRepository(client);

    await expect(
      repository.updateWithVersion(
        {
          taskId: 't1',
          title: 'new',
          description: null,
          status: 'todo',
          priority: 'medium',
          assignee: null,
          dueDate: null,
          parentTaskId: null,
          updatedBy: 'u1',
          updatedAt: '2026-04-26T00:00:00Z'
        },
        1
      )
    ).rejects.toThrow(ERROR_CODES.TASK_CONFLICT);
  });

  it('CommentRepository.updateWithVersion throws conflict when no row updated', async () => {
    const client = new FakeSqliteClient();
    client.runResult = { changes: 0 };
    const repository = new CommentRepository(client);

    await expect(
      repository.updateWithVersion({ commentId: 'c1', body: 'new', updatedBy: 'u1', updatedAt: '2026-04-26T00:00:00Z' }, 1)
    ).rejects.toThrow(ERROR_CODES.COMMENT_CONFLICT);
  });

  it('CommentRepository.softDelete throws not-found when no row updated', async () => {
    const client = new FakeSqliteClient();
    client.runResult = { changes: 0 };
    const repository = new CommentRepository(client);

    await expect(repository.softDelete('c1', '2026-04-26T00:00:00Z', 'u1', 1)).rejects.toThrow(ERROR_CODES.COMMENT_NOT_FOUND);
  });

  it('ProjectPermissionRepository.expireDuePermissions returns changed count', async () => {
    const client = new FakeSqliteClient();
    client.runResult = { changes: 3 };
    const repository = new ProjectPermissionRepository(client);

    await expect(repository.expireDuePermissions('2026-04-26T00:00:00Z')).resolves.toBe(3);
  });

  it('ProjectPermissionRepository.revoke updates only revoked_at (does not overwrite granted_by)', async () => {
    const client = new FakeSqliteClient();
    const repository = new ProjectPermissionRepository(client);

    await repository.revoke('g1', '2026-04-26T00:00:00Z', 'admin-user');

    const call = client.executed.find((item) => item.type === 'run' && item.sql.includes('UPDATE project_permissions'));
    expect(call?.sql.includes('granted_by')).toBe(false);
  });

  it('supports repositories for audit/access/profile/wrapper/feature/connector', async () => {
    const client = new FakeSqliteClient();

    await new AuditLogRepository(client).append({
      logId: 'l1', actorId: 'u1', actionType: 'TASK_CREATED', targetType: 'task', targetId: 't1', payloadDiffJson: '{}', retentionClass: 'default', createdAt: '2026-04-26T00:00:00Z'
    });

    await new AccessKeyRepository(client).save({
      keyId: 'k1', ownerType: 'user', issuedFor: 'u1', keyHash: 'h', keySalt: 's', expiresAt: null, revokedAt: null, issuedBy: 'admin', issuedAt: '2026-04-26T00:00:00Z'
    });

    await new DatabaseProfileRepository(client).save({
      profileId: 'p1', name: 'main', path: '/db.sqlite', mode: 'readWrite', encryptedDek: new Uint8Array([1]), dekWrapSalt: 'salt'
    });

    await new ProfileKeyWrapperRepository(client).upsert({
      profileId: 'p1', keyId: 'k1', encryptedDek: new Uint8Array([1]), wrapSalt: 'salt', kekVersion: 1, wrapperStatus: 'active', createdAt: '2026-04-26T00:00:00Z', revokedAt: null
    });

    await new FeatureFlagRepository(client).upsert({
      flagKey: 'github.sync', enabled: true, scopeType: 'global', scopeId: null, updatedBy: 'admin', updatedAt: '2026-04-26T00:00:00Z'
    });

    await new ConnectorSettingsRepository(client).upsert({
      connectorId: 'github', profileId: 'p1', enabled: true, authType: 'token', settingsJson: '{}', secretRef: 'secret:1', syncPolicy: 'manual', updatedBy: 'admin', updatedAt: '2026-04-26T00:00:00Z'
    });

    expect(client.executed.filter((item) => item.type === 'run').length).toBeGreaterThanOrEqual(6);
  });
});
