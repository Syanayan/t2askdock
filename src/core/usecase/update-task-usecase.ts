import { Task, type Priority, type TaskStatus } from '../domain/entities/task.js';
import type { AuditLogRepository } from '../ports/repositories/audit-log-repository.js';
import type { TaskRepository } from '../ports/repositories/task-repository.js';
import type { IdGenerator } from '../ports/services/id-generator.js';
import type { TransactionManager } from '../ports/services/transaction-manager.js';

export type UpdateTaskInput = {
  taskId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee: string | null;
  dueDate: string | null;
  tags: string[];
  parentTaskId: string | null;
  actorId: string;
  now: string;
  expectedVersion: number;
};

export type UpdateTaskOutput = {
  id: string;
  title: string;
  status: TaskStatus;
  version: number;
};

export class UpdateTaskUseCase {
  public constructor(
    private readonly taskRepository: TaskRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly transactionManager: TransactionManager,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(input: UpdateTaskInput): Promise<UpdateTaskOutput> {
    const task = Task.from({
      taskId: input.taskId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assignee: input.assignee,
      dueDate: input.dueDate,
      tags: input.tags,
      parentTaskId: input.parentTaskId,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      createdAt: input.now,
      updatedAt: input.now,
      version: input.expectedVersion
    });

    await this.transactionManager.runInTx(async () => {
      await this.taskRepository.updateWithVersion(
        {
          taskId: task.value.taskId,
          title: task.value.title,
          description: task.value.description,
          status: task.value.status,
          priority: task.value.priority,
          assignee: task.value.assignee,
          dueDate: task.value.dueDate,
          tags: task.value.tags,
          parentTaskId: task.value.parentTaskId,
          updatedBy: input.actorId,
          updatedAt: input.now
        },
        input.expectedVersion
      );

      await this.auditLogRepository.append({
        logId: this.idGenerator.nextUlid(),
        actorId: input.actorId,
        actionType: 'TASK_UPDATED',
        targetType: 'task',
        targetId: task.value.taskId,
        payloadDiffJson: JSON.stringify(task.value),
        retentionClass: 'default',
        createdAt: input.now
      });
    });

    return {
      id: task.value.taskId,
      title: task.value.title,
      status: task.value.status,
      version: input.expectedVersion + 1
    };
  }
}
