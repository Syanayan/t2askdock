import type { SortKey } from './my-recent-tasks-provider.js';
import type { ProjectTaskLoader, TaskTreeItem } from './task-tree-view-provider.js';

export class AllProjectsProvider {
  private readonly listeners = new Set<() => void>();
  private sortBy: SortKey = 'updatedAt';
  private showDone = false;

  public constructor(private readonly loader: ProjectTaskLoader) {}

  public refresh(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public onRefresh(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setSort(sortBy: SortKey): void {
    this.sortBy = sortBy;
    this.refresh();
  }

  public isShowingDone(): boolean {
    return this.showDone;
  }

  public toggleDone(): void {
    this.showDone = !this.showDone;
    this.refresh();
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
      const tasks = await this.loader.listTasksByProject({
        projectId: parent.id,
        offset: 0,
        limit: 5,
        sortBy: this.sortBy,
        excludeDone: !this.showDone
      });
      return tasks
        .filter(task => this.showDone || task.status !== 'done')
        .map(task => ({
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
      return subtasks
        .filter(task => this.showDone || task.status !== 'done')
        .map(task => ({
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
