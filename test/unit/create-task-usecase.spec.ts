import { describe, expect, it, vi } from 'vitest';
import { CreateTaskUseCase } from '../../src/core/usecase/create-task-usecase.js';

const ACTOR_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const LOG_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY';

describe('CreateTaskUseCase', () => {
  it('creates task then appends TASK_CREATED audit log in one transaction', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn(async (work: () => Promise<unknown>) => work());
    const nextUlid = vi.fn().mockReturnValue(LOG_ID);

    const useCase = new CreateTaskUseCase(
      { create },
      { append },
      { runInTx },
      { nextUlid }
    );

    const output = await useCase.execute({
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      title: 'phase3 usecase',
      description: null,
      status: 'todo',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      tags: ['phase3'],
      parentTaskId: null,
      actorId: ACTOR_ID,
      now: '2026-04-26T00:00:00.000Z'
    });

    expect(runInTx).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: LOG_ID,
        actorId: ACTOR_ID,
        actionType: 'TASK_CREATED',
        targetType: 'task',
        targetId: TASK_ID
      })
    );
    expect(output).toEqual({ id: TASK_ID, title: 'phase3 usecase' });
  });
});
