import { describe, expect, it, vi } from 'vitest';
import { AppContainer } from '../../src/core/di/container.js';
import { CreateTaskCommand } from '../../src/ui/commands/create-task-command.js';

describe('CreateTaskCommand integration', () => {
  it('runs UI command -> usecase -> infrastructure in one flow', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const append = vi.fn().mockResolvedValue(undefined);
    const runInTx = vi.fn(async (work: () => Promise<unknown>) => work());
    const nextUlid = vi.fn().mockReturnValue('01ARZ3NDEKTSV4RRFFQ69G5FAY');

    const container = new AppContainer({
      taskRepository: { create },
      auditLogRepository: { append },
      transactionManager: { runInTx },
      idGenerator: { nextUlid }
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
      now: '2026-04-26T00:00:00.000Z'
    });

    expect(create).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(output.id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAW');
  });
});
