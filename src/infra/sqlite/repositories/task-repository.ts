import { ERROR_CODES } from '../../../core/errors/error-codes.js';
import type { Task } from '../../../core/domain/entities/task.js';
import type {
  TaskRepository as TaskRepositoryPort,
  TaskUpdate
} from '../../../core/ports/repositories/task-repository.js';
import type { SqliteClient } from '../sqlite-client.js';

export class TaskRepository implements TaskRepositoryPort {
  public constructor(private readonly client: SqliteClient) {}

  public async create(task: Task): Promise<void> {
    await this.client.run(
      `INSERT INTO tasks(task_id, project_id, title, description, status, priority, assignee, due_date, parent_task_id, created_by, updated_by, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.value.taskId,
        task.value.projectId,
        task.value.title,
        task.value.description,
        task.value.status,
        task.value.priority,
        task.value.assignee,
        task.value.dueDate,
        task.value.parentTaskId,
        task.value.createdBy,
        task.value.updatedBy,
        task.value.createdAt,
        task.value.updatedAt,
        task.value.version
      ]
    );

    for (const tag of task.value.tags) {
      await this.client.run(
        `INSERT INTO task_tags(task_id, tag, tag_norm, created_at)
         VALUES (?, ?, LOWER(TRIM(?)), ?)`,
        [task.value.taskId, tag, tag, task.value.createdAt]
      );
    }
  }

  public async updateWithVersion(task: TaskUpdate, expectedVersion: number): Promise<void> {
    const result = await this.client.run(
      `UPDATE tasks
       SET title = ?, description = ?, status = ?, priority = ?, assignee = ?, due_date = ?, parent_task_id = ?, updated_by = ?, updated_at = ?, version = version + 1
       WHERE task_id = ? AND version = ?`,
      [
        task.title,
        task.description,
        task.status,
        task.priority,
        task.assignee,
        task.dueDate,
        task.parentTaskId,
        task.updatedBy,
        task.updatedAt,
        task.taskId,
        expectedVersion
      ]
    );

    if (result.changes === 0) {
      throw new Error(ERROR_CODES.TASK_CONFLICT);
    }
  }
}
