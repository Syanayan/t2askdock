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
};

export class TaskTreeViewProvider {
  public constructor(
    private readonly loader: ProjectTaskLoader,
    private readonly pageSize = 100
  ) {}

  public async getChildren(parent?: { kind: 'project'; id: string } | { kind: 'task'; id: string }): Promise<TaskTreeItem[]> {
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

    return [];
  }
}
