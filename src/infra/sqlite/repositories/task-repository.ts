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

    await this.client.run(`DELETE FROM task_tags WHERE task_id = ?`, [task.taskId]);
    for (const tag of task.tags) {
      await this.client.run(
        `INSERT INTO task_tags(task_id, tag, tag_norm, created_at)
         VALUES (?, ?, LOWER(TRIM(?)), ?)`,
        [task.taskId, tag, tag, task.updatedAt]
      );
    }
  }

  public async listProjects(): Promise<Array<{ projectId: string; projectName: string }>> {
    const rows = await this.client.all<{ projectId: string }>(
      `SELECT project_id AS projectId
       FROM tasks
       GROUP BY project_id
       ORDER BY MAX(updated_at) DESC`
    );

    return rows.map((row) => ({ projectId: row.projectId, projectName: row.projectId }));
  }

  public async listTasksByProject(input: {
    projectId: string;
    offset: number;
    limit: number;
  }): Promise<Array<{ taskId: string; title: string; status: Task['value']['status']; hasChildren: boolean }>> {
    return this.client.all<{ taskId: string; title: string; status: Task['value']['status']; hasChildren: number }>(
      `SELECT t.task_id AS taskId,
              t.title AS title,
              t.status AS status,
              EXISTS(
                SELECT 1
                FROM tasks c
                WHERE c.parent_task_id = t.task_id
              ) AS hasChildren
       FROM tasks t
       WHERE t.project_id = ?
       ORDER BY t.updated_at DESC
       LIMIT ? OFFSET ?`,
      [input.projectId, input.limit, input.offset]
    ).then((rows) => rows.map((row) => ({ ...row, hasChildren: row.hasChildren === 1 })));
  }
}
