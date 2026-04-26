import { ERROR_CODES } from '../../../core/errors/error-codes.js';
import type { SqliteClient } from '../sqlite-client.js';

export type TaskUpdate = {
  taskId: string;
  title: string;
  updatedBy: string;
  updatedAt: string;
};

export class TaskRepository {
  public constructor(private readonly client: SqliteClient) {}

  public async updateWithVersion(task: TaskUpdate, expectedVersion: number): Promise<void> {
    const result = await this.client.run(
      `UPDATE tasks
       SET title = ?, updated_by = ?, updated_at = ?, version = version + 1
       WHERE task_id = ? AND version = ?`,
      [task.title, task.updatedBy, task.updatedAt, task.taskId, expectedVersion]
    );

    if (result.changes === 0) {
      throw new Error(ERROR_CODES.TASK_CONFLICT);
    }
  }
}
