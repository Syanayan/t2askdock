import { describe, expect, it } from 'vitest';
import { DueDate } from '../../../src/core/domain/value-objects/due-date.js';
import { Tag } from '../../../src/core/domain/value-objects/tag.js';
import { Title } from '../../../src/core/domain/value-objects/title.js';
import { Ulid } from '../../../src/core/domain/value-objects/ulid.js';
import { Version } from '../../../src/core/domain/value-objects/version.js';
import { Comment } from '../../../src/core/domain/entities/comment.js';
import { Task } from '../../../src/core/domain/entities/task.js';
import { User } from '../../../src/core/domain/entities/user.js';
import { AccessKeyPolicy } from '../../../src/core/domain/services/access-key-policy.js';
import { AuthorizeTaskEditPolicy } from '../../../src/core/domain/services/authorize-task-edit-policy.js';
import { ConflictDetector } from '../../../src/core/domain/services/conflict-detector.js';

const ULID_1 = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ULID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const ULID_3 = '01ARZ3NDEKTSV4RRFFQ69G5FAX';

describe('phase1 value objects', () => {
  it('validates ulid/title/dueDate/tag/version', () => {
    expect(Ulid.from(ULID_1).value).toBe(ULID_1);
    expect(Title.from('  hello  ').value).toBe('hello');
    expect(DueDate.from('2026-04-26').value).toBe('2026-04-26');
    expect(Tag.from('  Bug  ').normalized).toBe('bug');
    expect(Version.from(1).increment().value).toBe(2);
  });

  it('rejects invalid values', () => {
    expect(() => Ulid.from('bad')).toThrow();
    expect(() => Title.from(' '.repeat(201))).toThrow();
    expect(() => DueDate.from('2026-02-30')).toThrow();
    expect(() => Version.from(0)).toThrow();
    expect(() => Tag.ensureUnique([Tag.from('Bug'), Tag.from(' bug ')])).toThrow();
  });
});

describe('phase1 entities', () => {
  it('creates user/task/comment with domain validation', () => {
    const user = User.from({
      userId: ULID_1,
      displayName: 'Alice',
      role: 'general',
      status: 'active',
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z'
    });

    const task = Task.from({
      taskId: ULID_2,
      projectId: ULID_3,
      title: 'Task 1',
      description: 'desc',
      status: 'todo',
      priority: 'medium',
      assignee: ULID_1,
      dueDate: '2026-05-01',
      tags: ['Bug', 'UI'],
      parentTaskId: null,
      createdBy: ULID_1,
      updatedBy: ULID_1,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z',
      version: 1,
      progress: 0
    });

    const comment = Comment.from({
      commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
      taskId: ULID_2,
      body: 'hello<script>alert(1)</script>',
      createdBy: ULID_1,
      updatedBy: ULID_1,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z',
      version: 1,
      deletedAt: null
    });

    expect(user.value.displayName).toBe('Alice');
    expect(task.value.tags).toEqual(['Bug', 'UI']);
    expect(comment.value.body).toBe('hello');
  });
});

describe('phase1 domain services', () => {
  it('authorizes task edit by ownership/grant and denies read-only', () => {
    const policy = new AuthorizeTaskEditPolicy();
    const task = {
      taskId: ULID_2,
      projectId: ULID_3,
      title: 'Task',
      description: null,
      status: 'todo' as const,
      priority: 'low' as const,
      assignee: ULID_1,
      dueDate: null,
      tags: [],
      parentTaskId: null,
      createdBy: ULID_1,
      updatedBy: ULID_1,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z',
      version: 1
    };

    const activeUser = {
      userId: ULID_1,
      displayName: 'Alice',
      role: 'general' as const,
      status: 'active' as const,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z'
    };

    expect(
      policy.evaluate({ currentUser: activeUser, task, projectPermissionGrants: [], connectionMode: 'READ_WRITE' }).allow
    ).toBe(true);

    expect(
      policy.evaluate({
        currentUser: { ...activeUser, userId: '01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
        task,
        projectPermissionGrants: [{ projectId: ULID_3, userId: '01ARZ3NDEKTSV4RRFFQ69G5FAZ', canEdit: true, revokedAt: null }],
        connectionMode: 'READ_WRITE'
      }).allow
    ).toBe(true);

    expect(
      policy.evaluate({ currentUser: activeUser, task, projectPermissionGrants: [], connectionMode: 'READ_ONLY' }).reasonCode
    ).toBe('READ_ONLY');
  });

  it('detects conflicts and validates key lifecycle', () => {
    const detector = new ConflictDetector();
    expect(detector.detect(1, 1)).toEqual({ isConflict: false, conflictType: null });
    expect(detector.detect(1, 2)).toEqual({ isConflict: true, conflictType: 'VersionMismatch' });
    expect(detector.detect(1, null)).toEqual({ isConflict: true, conflictType: 'Deleted' });

    const policy = new AccessKeyPolicy();
    const now = new Date('2026-04-26T00:00:00.000Z');
    expect(policy.validate({ revokedAt: null, expiresAt: '2026-05-01T00:00:00.000Z' }, now).valid).toBe(true);
    expect(policy.validate({ revokedAt: '2026-04-25T00:00:00.000Z', expiresAt: null }, now).reason).toBe('REVOKED');
    expect(policy.validate({ revokedAt: null, expiresAt: '2026-04-25T00:00:00.000Z' }, now).reason).toBe('EXPIRED');
  });
});
