import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';

export type TaskTreeItem = {
  id: string;
  label: string;
  kind: 'database' | 'project' | 'task' | 'subtask';
  status?: TaskStatus;
  priority?: Priority;
  projectId?: string;
  profileId?: string;
  available?: boolean;
  hasChildren: boolean;
};

export type ProjectTaskLoader = {
  listProjects(): Promise<Array<{ projectId: string; projectName: string }>>;
  listTasksByProject(input: {
    projectId: string;
    offset: number;
    limit: number;
    sortBy?: 'updatedAt' | 'priority' | 'dueDate';
    excludeDone?: boolean;
  }): Promise<Array<{ taskId: string; title: string; status: TaskStatus; priority: Priority; version: number; hasChildren: boolean }>>;
  listSubtasksByParent(parentTaskId: string): Promise<Array<{ taskId: string; title: string; status: TaskStatus; priority: Priority; hasChildren: boolean }>>;
};

export class TaskTreeViewProvider {
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly loader: ProjectTaskLoader,
    private readonly pageSize = 100
  ) {}

  public refresh(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public onRefresh(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async getChildren(parent?: TaskTreeItem): Promise<TaskTreeItem[]> {
    if (!parent) {
      const projects = await this.loader.listProjects();
      return projects.map(project => ({
        id: project.projectId,
        label: project.projectName,
        kind: 'project',
        projectId: project.projectId,
        hasChildren: true
      }));
    }

    if (parent.kind === 'project') {
      const tasks = await this.loader.listTasksByProject({ projectId: parent.id, offset: 0, limit: this.pageSize });
      return tasks.map(task => ({
        id: task.taskId,
        label: task.title,
        kind: 'task',
        status: task.status,
        priority: task.priority,
        projectId: parent.id,
        hasChildren: task.hasChildren
      }));
    }


    if ((parent.kind === 'task' || parent.kind === 'subtask') && parent.hasChildren) {
      const subtasks = await this.loader.listSubtasksByParent(parent.id);
      return subtasks.map(task => ({
        id: task.taskId,
        label: task.title,
        kind: 'subtask',
        status: task.status,
        priority: task.priority,
        projectId: parent.projectId,
        hasChildren: task.hasChildren
      }));
    }

    return [];
  }
}
