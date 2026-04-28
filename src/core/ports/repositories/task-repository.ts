import type { Task } from '../../domain/entities/task.js';

export type TaskUpdate = {
  taskId: string;
  title: string;
  description: string | null;
  status: Task['value']['status'];
  priority: Task['value']['priority'];
  assignee: string | null;
  dueDate: string | null;
  tags: string[];
  parentTaskId: string | null;
  updatedBy: string;
  updatedAt: string;
};

export interface TaskRepository {
  create(task: Task): Promise<void>;
  updateWithVersion(task: TaskUpdate, expectedVersion: number): Promise<void>;
  listProjects(): Promise<Array<{ projectId: string; projectName: string }>>;
  listTasksByProject(input: {
    projectId: string;
    offset: number;
    limit: number;
  }): Promise<Array<{ taskId: string; title: string; status: Task['value']['status']; hasChildren: boolean }>>;
}
