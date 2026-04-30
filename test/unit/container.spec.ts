import { describe, expect, it, vi } from 'vitest';
import { AppContainer } from '../../src/core/di/container.js';

const ULID_1 = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ULID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const ULID_3 = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const ULID_4 = '01ARZ3NDEKTSV4RRFFQ69G5FAY';

describe('AppContainer', () => {
  it('injects infrastructure implementation into use case', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn((work: () => Promise<unknown>) => work()) as unknown as <T>(work: () => Promise<T>) => Promise<T>;
    const nextUlid = vi.fn().mockReturnValue(ULID_4);
    const container = new AppContainer({
      taskRepository: {
        create,
        updateWithVersion: vi.fn(),
        listProjects: vi.fn().mockResolvedValue([]),
        listTasksByProject: vi.fn().mockResolvedValue([]),
        listMyTasks: vi.fn().mockResolvedValue([]),
        findDetailById: vi.fn().mockResolvedValue(null),
        listSubtasksByParent: vi.fn().mockResolvedValue([]),
        listTasksWithDetail: vi.fn().mockResolvedValue([]),
        deleteById: vi.fn().mockResolvedValue(undefined)
      },
      commentRepository: {
        create: vi.fn(),
        updateWithVersion: vi.fn(),
        softDelete: vi.fn(),
        findByTask: vi.fn()
      },
      auditLogRepository: { append },
      transactionManager: { runInTx },
      idGenerator: { nextUlid },
      databaseProfileRepository: { findById: vi.fn(), setMode: vi.fn() },
      authStateReader: { isAuthenticated: vi.fn() },
      connectionHealthChecker: { check: vi.fn() },
      featureFlagRepository: { upsert: vi.fn() },
      backupSnapshotFactory: { createSnapshot: vi.fn() },
      backupSnapshotRepository: { create: vi.fn(), rotate: vi.fn(), findById: vi.fn() },
      snapshotIntegrityVerifier: { verify: vi.fn() },
      backupRestoreOperator: { previewDiff: vi.fn(), backupCurrent: vi.fn(), restore: vi.fn(), verifyConnection: vi.fn() }
    });

    const output = await container.buildUseCases().createTaskUseCase.execute({
      taskId: ULID_2,
      projectId: ULID_3,
      title: 'test',
      description: null,
      status: 'todo',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      tags: ['phase3'],
      parentTaskId: null,
      actorId: ULID_1,
      now: '2026-04-26T00:00:00.000Z',
      progress: 0
    });

    expect(runInTx).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(output).toEqual({ id: ULID_2, title: 'test' });
  });
});
