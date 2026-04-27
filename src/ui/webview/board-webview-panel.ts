import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UiEventBus } from '../events/ui-event-bus.js';

export class BoardWebviewPanel {
  public constructor(
    private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
    private readonly eventBus: UiEventBus
  ) {}

  public async onDrop(input: {
    taskId: string;
    projectId: string;
    actorId: string;
    toStatus: TaskStatus;
    title: string;
    description: string | null;
    priority: Priority;
    assignee: string | null;
    dueDate: string | null;
    tags: string[];
    parentTaskId: string | null;
    expectedVersion: number;
    now: string;
  }): Promise<{ taskId: string; status: TaskStatus; version: number }> {
    const output = await this.moveTaskStatusUseCase.execute({
      taskId: input.taskId,
      projectId: input.projectId,
      actorId: input.actorId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      assignee: input.assignee,
      dueDate: input.dueDate,
      tags: input.tags,
      parentTaskId: input.parentTaskId,
      expectedVersion: input.expectedVersion,
      now: input.now,
      toStatus: input.toStatus
    });

    this.eventBus.publish({
      type: 'TASK_UPDATED',
      payload: { taskId: output.id, status: output.status, version: output.version }
    });

    return { taskId: output.id, status: output.status, version: output.version };
  }
}
