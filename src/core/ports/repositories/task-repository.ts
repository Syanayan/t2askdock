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
  progress: number;
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
  progress: number;
};

export type TaskTreeNode = {
  taskId: string;
  title: string;
  status: Task['value']['status'];
  priority: Task['value']['priority'];
  assignee: string | null;
  progress: number;
  version: number;
  children: TaskTreeNode[];
};

export interface TaskRepository {
  create(task: Task): Promise<void>;
  updateWithVersion(task: TaskUpdate, expectedVersion: number): Promise<void>;
  listProjects(): Promise<Array<{ projectId: string; projectName: string }>>;
  listTasksByProject(input: {
    projectId: string;
    offset: number;
    limit: number;
    sortBy?: 'updatedAt' | 'priority' | 'dueDate';
    excludeDone?: boolean;
  }): Promise<Array<{ taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; version: number; hasChildren: boolean }>>;
  listMyTasks(input: {
    userId: string;
    limit: number;
    sortBy: 'updatedAt' | 'priority' | 'dueDate';
  }): Promise<Array<{ taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; version: number; hasChildren: boolean }>>;
  findDetailById(taskId: string): Promise<TaskDetail | null>;
  listSubtasksByParent(parentTaskId: string): Promise<Array<{ taskId: string; title: string; status: Task['value']['status']; priority: Task['value']['priority']; hasChildren: boolean }>>;
  listTasksWithDetail(projectId: string): Promise<TaskTreeNode[]>;
  deleteById(taskId: string): Promise<void>;
}
