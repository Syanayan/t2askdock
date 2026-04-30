import type { TaskStatus } from '../../core/domain/entities/task.js';

export type TaskTreeItem = {
  id: string;
  label: string;
  kind: 'project' | 'task' | 'subtask';
  status?: TaskStatus;
  hasChildren: boolean;
};

export type ProjectTaskLoader = {
  listProjects(): Promise<Array<{ projectId: string; projectName: string }>>;
  listTasksByProject(input: {
    projectId: string;
    offset: number;
    limit: number;
  }): Promise<Array<{ taskId: string; title: string; status: TaskStatus; hasChildren: boolean }>>;
  listSubtasksByParent?(parentTaskId: string): Promise<Array<{ taskId: string; title: string; status: TaskStatus; hasChildren: boolean }>>;
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
        hasChildren: task.hasChildren
      }));
    }


    if ((parent.kind === 'task' || parent.kind === 'subtask') && parent.hasChildren) {
      if (!this.loader.listSubtasksByParent) return [];
      const subtasks = await this.loader.listSubtasksByParent(parent.id);
      return subtasks.map(task => ({
        id: task.taskId,
        label: task.title,
        kind: 'subtask',
        status: task.status,
        hasChildren: task.hasChildren
      }));
    }

    return [];
  }
}
