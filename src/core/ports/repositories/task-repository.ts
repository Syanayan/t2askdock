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

export type TaskDetail = {
  taskId: string;
  projectId: string;
  title: string;
  status: Task['value']['status'];
  priority: Task['value']['priority'];
  dueDate: string | null;
  tags: string[];
  description: string | null;
  assignee: string | null;
  parentTaskId: string | null;
  version: number;
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
  findDetailById(taskId: string): Promise<TaskDetail | null>;
  deleteById(taskId: string): Promise<void>;
}

