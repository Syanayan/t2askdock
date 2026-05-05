import type { SortKey } from './my-recent-tasks-provider.js';
import type { ProjectTaskLoader, TaskTreeItem } from './task-tree-view-provider.js';
import type { MultiDbReadManager } from '../../infra/sqlite/multi-db-read-manager.js';

export class AllProjectsProvider {
  private readonly listeners = new Set<() => void>();
  private sortBy: SortKey = 'updatedAt';
  private doneFilter: 'active' | 'done' = 'active';

  public constructor(
    private readonly loader: ProjectTaskLoader,
    private readonly multiDbReadManager?: MultiDbReadManager
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

  public setSort(sortBy: SortKey): void {
    this.sortBy = sortBy;
    this.refresh();
  }

  public isShowingDone(): boolean {
    return this.doneFilter === 'done';
  }

  public toggleDone(): void {
    this.doneFilter = this.doneFilter === 'active' ? 'done' : 'active';
    this.refresh();
  }

  public async getChildren(parent?: TaskTreeItem): Promise<TaskTreeItem[]> {
    if (!parent) {
      if (this.multiDbReadManager) {
        return this.multiDbReadManager.getProfiles().map(profile => ({
          id: profile.profileId,
          label: profile.name,
          kind: 'database',
          profileId: profile.profileId,
          available: profile.available,
          hasChildren: profile.available
        }));
      }
      const projects = await this.loader.listProjects();
      return projects.map(project => ({
        id: project.projectId,
        label: project.projectName,
        kind: 'project',
        projectId: project.projectId,
        hasChildren: true
      }));
    }

    if (parent.kind === 'database' && parent.profileId && this.multiDbReadManager) {
      const repo = this.multiDbReadManager.getRepo(parent.profileId);
      if (!repo) return [];
      const projects = await repo.listProjects();
      return projects.map(project => ({
        id: project.projectId,
        label: project.projectName,
        kind: 'project',
        projectId: project.projectId,
        profileId: parent.profileId,
        hasChildren: true
      }));
    }

    if (parent.kind === 'project') {
      const loader = parent.profileId && this.multiDbReadManager
        ? this.multiDbReadManager.getRepo(parent.profileId)
        : this.loader;
      if (!loader) return [];
      const tasksFromDb = await loader.listTasksByProject({
        projectId: parent.projectId ?? parent.id,
        offset: 0,
        limit: 5,
        sortBy: this.sortBy,
        excludeDone: this.doneFilter === 'active'
      });
      return tasksFromDb
        .filter(task => (this.doneFilter === 'done' ? task.status === 'done' : task.status !== 'done'))
        .map(task => ({
          id: task.taskId,
          label: task.title,
          kind: 'task',
          status: task.status,
          priority: task.priority,
          projectId: parent.projectId ?? parent.id,
          profileId: parent.profileId,
          hasChildren: task.hasChildren
        }));
    }

    if ((parent.kind === 'task' || parent.kind === 'subtask') && parent.hasChildren) {
      const loader = parent.profileId && this.multiDbReadManager
        ? this.multiDbReadManager.getRepo(parent.profileId)
        : this.loader;
      if (!loader) return [];
      const subtasks = await loader.listSubtasksByParent(parent.id);
      return subtasks
        .filter(task => (this.doneFilter === 'done' ? task.status === 'done' : task.status !== 'done'))
        .map(task => ({
          id: task.taskId,
          label: task.title,
          kind: 'subtask',
          status: task.status,
          priority: task.priority,
          projectId: parent.projectId,
          profileId: parent.profileId,
          hasChildren: task.hasChildren
        }));
    }

    return [];
  }
}
