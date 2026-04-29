import { describe, expect, it, vi } from 'vitest';
import { AppContainer } from '../../src/core/di/container.js';
import { CreateTaskCommand } from '../../src/ui/commands/create-task-command.js';

describe('CreateTaskCommand integration', () => {
  it('runs UI command -> usecase -> infrastructure in one flow', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn((work: () => Promise<unknown>) => work()) as unknown as <T>(work: () => Promise<T>) => Promise<T>;
    const nextUlid = vi.fn().mockReturnValue('01ARZ3NDEKTSV4RRFFQ69G5FAY');

    const container = new AppContainer({
      taskRepository: {
        create,
        updateWithVersion: vi.fn(),
        listProjects: vi.fn().mockResolvedValue([]),
        listTasksByProject: vi.fn().mockResolvedValue([]),
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

    const command = new CreateTaskCommand(container.buildUseCases().createTaskUseCase);
    const output = await command.run({
      taskId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      projectId: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
      title: 'phase3',
      description: null,
      status: 'todo',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      tags: [],
      parentTaskId: null,
      actorId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      now: '2026-04-26T00:00:00.000Z',
      progress: 0
    });

    expect(create).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(output.id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAW');
  });
});
