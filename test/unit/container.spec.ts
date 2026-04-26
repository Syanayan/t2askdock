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
    const runInTx = vi.fn(async (work: () => Promise<unknown>) => work());
    const nextUlid = vi.fn().mockReturnValue(ULID_4);
    const container = new AppContainer({
      taskRepository: { create },
      commentRepository: {
        create: vi.fn(),
        updateWithVersion: vi.fn(),
        softDelete: vi.fn(),
        findByTask: vi.fn()
      },
      accessKeyRepository: { save: vi.fn(), findByKeyId: vi.fn() },
      databaseProfileRepository: { save: vi.fn(), findById: vi.fn() },
      featureFlagRepository: { upsert: vi.fn() },
      projectPermissionRepository: { grant: vi.fn(), revoke: vi.fn(), expireDuePermissions: vi.fn() },
      auditLogRepository: { append },
      transactionManager: { runInTx },
      idGenerator: { nextUlid },
      accessKeyVerifier: { verify: vi.fn() }
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
      now: '2026-04-26T00:00:00.000Z'
    });

    expect(runInTx).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(output).toEqual({ id: ULID_2, title: 'test' });
  });
});
