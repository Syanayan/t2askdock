import { ERROR_CODES } from '../../../core/errors/error-codes.js';
import type { Task } from '../../../core/domain/entities/task.js';
import type {
  TaskRepository as TaskRepositoryPort,
  TaskDetail,
  TaskTreeNode,
  TaskUpdate
} from '../../../core/ports/repositories/task-repository.js';
import type { ActiveClientHolder } from '../active-client-holder.js';

export class TaskRepository implements TaskRepositoryPort {
  public constructor(private readonly holder: ActiveClientHolder) {}

  public async create(task: Task): Promise<void> {
    await this.holder.get().run(
      `INSERT INTO tasks(task_id, project_id, title, description, status, priority, assignee, due_date, parent_task_id, created_by, updated_by, created_at, updated_at, version, progress)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        task.value.version,
        task.value.progress
      ]
    );

    for (const tag of task.value.tags) {
      await this.holder.get().run(
        `INSERT INTO task_tags(task_id, tag, tag_norm, created_at)
         VALUES (?, ?, LOWER(TRIM(?)), ?)`,
        [task.value.taskId, tag, tag, task.value.createdAt]
      );
    }
  }

  public async updateWithVersion(task: TaskUpdate, expectedVersion: number): Promise<void> {
    const result = await this.holder.get().run(
      `UPDATE tasks
       SET title = ?, description = ?, status = ?, priority = ?, assignee = ?, due_date = ?, parent_task_id = ?, updated_by = ?, updated_at = ?, progress = ?, version = version + 1
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
        task.progress,
        task.taskId,
        expectedVersion
      ]
    );

    if (result.changes === 0) {
      throw new Error(ERROR_CODES.TASK_CONFLICT);
    }

    await this.holder.get().run(`DELETE FROM task_tags WHERE task_id = ?`, [task.taskId]);
    for (const tag of task.tags) {
      await this.holder.get().run(
        `INSERT INTO task_tags(task_id, tag, tag_norm, created_at)
         VALUES (?, ?, LOWER(TRIM(?)), ?)`,
        [task.taskId, tag, tag, task.updatedAt]
      );
    }
  }

  public async listProjects(): Promise<Array<{ projectId: string; projectName: string }>> {
    const rows = await this.holder.get().all<{ projectId: string; projectName: string }>(
      `SELECT project_id AS projectId, name AS projectName
       FROM projects
       WHERE archived = 0
       ORDER BY updated_at DESC`
    );
    return [...rows];
  }

  public async listTasksByProject(input: {
    projectId: string;
    offset: number;
    limit: number;
    sortBy?: 'updatedAt' | 'priority' | 'dueDate';
    excludeDone?: boolean;
  }): Promise<Array<{ taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; version: number; hasChildren: boolean }>> {
    const sortBy = input.sortBy ?? 'updatedAt';
    const orderBy =
      sortBy === 'priority'
        ? `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC, t.updated_at DESC`
        : sortBy === 'dueDate'
          ? `CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ASC, t.updated_at DESC`
          : 't.updated_at DESC';
    const filters = [
      't.project_id = ?',
      't.parent_task_id IS NULL',
      ...(input.excludeDone ? [`t.status != 'done'`] : []),
      ...(sortBy === 'priority' ? [`t.priority != 'low'`] : [])
    ];
    return this.holder.get().all<{ taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; version: number; hasChildren: number }>(
      `SELECT t.task_id AS taskId,
              t.title AS title,
              t.status AS status,
              t.priority AS priority,
              t.version AS version,
              EXISTS(
                SELECT 1
                FROM tasks c
                WHERE c.parent_task_id = t.task_id
              ) AS hasChildren
       FROM tasks t
       WHERE ${filters.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [input.projectId, input.limit, input.offset]
    ).then((rows) => rows.map((row) => ({ ...row, hasChildren: row.hasChildren === 1 })));
  }

  public async listMyTasks(input: {
    userId: string;
    limit: number;
    sortBy: 'updatedAt' | 'priority' | 'dueDate';
  }): Promise<Array<{ taskId: string; projectId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; version: number; hasChildren: boolean }>> {
    const orderBy =
      input.sortBy === 'priority'
        ? `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC, t.updated_at DESC`
        : input.sortBy === 'dueDate'
          ? `CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ASC, t.updated_at DESC`
          : 't.updated_at DESC';
    return this.holder.get().all<{ taskId: string; projectId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; version: number; hasChildren: number }>(
      `SELECT t.task_id AS taskId,
              t.project_id AS projectId,
              t.title AS title,
              t.status AS status,
              t.priority AS priority,
              t.version AS version,
              EXISTS(SELECT 1 FROM tasks c WHERE c.parent_task_id = t.task_id) AS hasChildren
       FROM tasks t
       WHERE t.assignee = ?
         AND t.parent_task_id IS NULL
         AND t.status != 'done'
       ORDER BY ${orderBy}
       LIMIT ?`,
      [input.userId, input.limit]
    ).then((rows) => rows.map((row) => ({ ...row, hasChildren: row.hasChildren === 1 })));
  }

  public async findDetailById(taskId: string): Promise<TaskDetail | null> {
    const row = await this.holder.get().get<{
      taskId: string; projectId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority'];
      dueDate: string | null; description: string | null; assignee: string | null; parentTaskId: string | null; version: number; progress: number;
    }>(`SELECT task_id AS taskId, project_id AS projectId, title, status, priority, due_date AS dueDate, description, assignee, parent_task_id AS parentTaskId, version, progress
       FROM tasks WHERE task_id = ?`, [taskId]);
    if (!row) return null;
    const tags = await this.holder.get().all<{ tag: string }>(`SELECT tag FROM task_tags WHERE task_id = ? ORDER BY created_at ASC`, [taskId]);
    return { ...row, tags: tags.map((t) => t.tag) };
  }



  public async listSubtasksByParent(parentTaskId: string): Promise<Array<{ taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; hasChildren: boolean }>> {
    return this.holder.get().all<{ taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; version: number; hasChildren: number }>(
      `SELECT t.task_id AS taskId,
              t.title AS title,
              t.status AS status,
              t.priority AS priority,
              t.version AS version,
              EXISTS(SELECT 1 FROM tasks c WHERE c.parent_task_id = t.task_id) AS hasChildren
       FROM tasks t
       WHERE t.parent_task_id = ?
       ORDER BY t.updated_at DESC`,
      [parentTaskId]
    ).then((rows) => rows.map((row) => ({ ...row, hasChildren: row.hasChildren === 1 })));
  }

  public async listTasksWithDetail(projectId: string): Promise<TaskTreeNode[]> {
    const rows = await this.holder.get().all<{
      taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; assignee: string | null; progress: number; version: number; parentTaskId: string | null;
    }>(`SELECT task_id AS taskId, title, status, priority, assignee, progress, version, parent_task_id AS parentTaskId FROM tasks WHERE project_id = ? ORDER BY updated_at DESC`, [projectId]);
    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) { const key = r.parentTaskId; byParent.set(key, [...(byParent.get(key) ?? []), r]); }
    const build = (parentId: string | null): TaskTreeNode[] => (byParent.get(parentId) ?? []).map((r) => ({
      taskId: r.taskId, title: r.title, status: r.status, priority: r.priority, assignee: r.assignee, progress: r.progress, version: r.version, children: build(r.taskId)
    }));
    return build(null);
  }

  public async deleteById(taskId: string): Promise<void> {
    await this.holder.get().run(`DELETE FROM task_tags WHERE task_id = ?`, [taskId]);
    await this.holder.get().run(`DELETE FROM tasks WHERE task_id = ?`, [taskId]);
  }
}
