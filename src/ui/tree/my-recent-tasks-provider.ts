import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { TaskTreeItem } from './task-tree-view-provider.js';
import type { MultiDbReadManager } from '../../infra/sqlite/multi-db-read-manager.js';

export type MyRecentTaskLoader = {
  listMyTasks(input: {
    userId: string;
    limit: number;
    sortBy: 'updatedAt' | 'priority' | 'dueDate';
  }): Promise<Array<{ taskId: string; projectId: string; title: string; status: TaskStatus; priority: Priority; version: number; hasChildren: boolean }>>;
  listSubtasksByParent(parentTaskId: string): Promise<Array<{ taskId: string; title: string; status: TaskStatus; priority: Priority; hasChildren: boolean }>>;
};

export type SortKey = 'updatedAt' | 'priority' | 'dueDate';

export class MyRecentTasksProvider {
  private readonly listeners = new Set<() => void>();
  private sortBy: SortKey = 'updatedAt';

  public constructor(
    private readonly loader: MyRecentTaskLoader,
    private userId: string,
    private readonly multiDbReadManager?: MultiDbReadManager
  ) {}

  public setUserId(userId: string): void {
    this.userId = userId;
    this.refresh();
  }

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

  public async getChildren(parent?: TaskTreeItem): Promise<TaskTreeItem[]> {
    if (parent && (parent.kind === 'task' || parent.kind === 'subtask') && parent.hasChildren) {
      const repo = parent.profileId ? this.multiDbReadManager?.getRepo(parent.profileId) : undefined;
      const loader = repo ?? this.loader;
      const subtasks = await loader.listSubtasksByParent(parent.id);
      return subtasks.map(task => ({
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

    if (parent) {
      return [];
    }

    const input = { userId: this.userId, limit: 5, sortBy: this.sortBy };
    const profiles = this.multiDbReadManager?.getProfiles() ?? [];
    if (profiles.length === 0) {
      const tasks = await this.loader.listMyTasks(input);
      return tasks.map(task => ({
        id: task.taskId,
        label: task.title,
        kind: 'task',
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        hasChildren: task.hasChildren
      }));
    }

    const allResults = await Promise.all(
      profiles.map(async profile => {
        const repo = this.multiDbReadManager!.getRepo(profile.profileId);
        if (!repo) return [];
        try {
          const tasks = await repo.listMyTasks(input);
          return tasks.map(task => ({ ...task, profileId: profile.profileId }));
        } catch {
          return [];
        }
      })
    );
    const merged = allResults.flat();
    merged.sort((a, b) => a.taskId < b.taskId ? 1 : -1);
    return merged.slice(0, 5).map(task => ({
      id: task.taskId,
      label: task.title,
      kind: 'task',
      status: task.status,
      priority: task.priority,
      projectId: task.projectId,
      profileId: task.profileId,
      hasChildren: task.hasChildren
    }));
  }
}
