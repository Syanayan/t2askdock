import { describe, expect, it, vi } from 'vitest';
import { MoveTaskStatusUseCase } from '../../src/core/usecase/move-task-status-usecase.js';
import { UpdateTaskUseCase } from '../../src/core/usecase/update-task-usecase.js';
import { AddTaskCommentUseCase } from '../../src/core/usecase/comments/add-task-comment-usecase.js';
import { DeleteTaskCommentUseCase } from '../../src/core/usecase/comments/delete-task-comment-usecase.js';
import { ListTaskCommentsUseCase } from '../../src/core/usecase/comments/list-task-comments-usecase.js';
import { UpdateTaskCommentUseCase } from '../../src/core/usecase/comments/update-task-comment-usecase.js';

const ACTOR_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAX';

describe('phase3 usecases', () => {
  it('UpdateTaskUseCase updates task + audit in one tx', async () => {
    const updateWithVersion = vi.fn().mockResolvedValue(undefined);
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn(async (work: () => Promise<unknown>) => work());
    const nextUlid = vi.fn().mockReturnValue('01ARZ3NDEKTSV4RRFFQ69G5FAY');

    const useCase = new UpdateTaskUseCase(
      { create: vi.fn(), updateWithVersion },
      { append },
      { runInTx },
      { nextUlid }
    );

    const output = await useCase.execute({
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      title: 'updated',
      description: null,
      status: 'in_progress',
      priority: 'high',
      assignee: null,
      dueDate: null,
      tags: ['phase3'],
      parentTaskId: null,
      actorId: ACTOR_ID,
      now: '2026-04-26T00:00:00.000Z',
      expectedVersion: 3,
      progress: 20
    });

    expect(runInTx).toHaveBeenCalledOnce();
    expect(updateWithVersion).toHaveBeenCalledOnce();
    expect(updateWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['phase3'] }),
      3
    );
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'TASK_UPDATED', targetId: TASK_ID }));
    expect(output.version).toBe(4);
  });

  it('MoveTaskStatusUseCase delegates to UpdateTaskUseCase with toStatus', async () => {
    const execute = vi.fn().mockResolvedValue({ id: TASK_ID, title: 'a', status: 'done', version: 2 });
    const useCase = new MoveTaskStatusUseCase({ execute } as Pick<UpdateTaskUseCase, 'execute'> as UpdateTaskUseCase);

    await useCase.execute({
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      title: 'a',
      description: null,
      toStatus: 'done',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      tags: [],
      parentTaskId: null,
      actorId: ACTOR_ID,
      now: '2026-04-26T00:00:00.000Z',
      expectedVersion: 1,
      progress: 10
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
  });

  it('comment usecases call repository + audit as expected', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const updateWithVersion = vi.fn().mockResolvedValue(undefined);
    const softDelete = vi.fn().mockResolvedValue(undefined);
    const findByTask = vi.fn().mockResolvedValue([{ commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAY' }]);
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn(async (work: () => Promise<unknown>) => work());
    const nextUlid = vi.fn().mockReturnValue('01ARZ3NDEKTSV4RRFFQ69G5FAZ');

    const add = new AddTaskCommentUseCase({ create, updateWithVersion, softDelete, findByTask }, { append }, { runInTx }, { nextUlid });
    const update = new UpdateTaskCommentUseCase({ create, updateWithVersion, softDelete, findByTask }, { append }, { runInTx }, { nextUlid });
    const remove = new DeleteTaskCommentUseCase({ create, updateWithVersion, softDelete, findByTask }, { append }, { runInTx }, { nextUlid });
    const list = new ListTaskCommentsUseCase({ create, updateWithVersion, softDelete, findByTask });

    await add.execute({
      commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
      taskId: TASK_ID,
      body: 'hello',
      actorId: ACTOR_ID,
      now: '2026-04-26T00:00:00.000Z',
      progress: 0
    });
    await update.execute({
      commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
      taskId: TASK_ID,
      body: 'new body',
      actorId: ACTOR_ID,
      now: '2026-04-26T00:00:00.000Z',
      expectedVersion: 1,
      progress: 10
    });
    await remove.execute({
      commentId: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
      actorId: ACTOR_ID,
      now: '2026-04-26T00:00:00.000Z',
      expectedVersion: 2
    });

    const rows = await list.execute({ taskId: TASK_ID });

    expect(create).toHaveBeenCalledOnce();
    expect(updateWithVersion).toHaveBeenCalledOnce();
    expect(softDelete).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(1);
  });
});
