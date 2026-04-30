import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { TaskTreeItem } from './task-tree-view-provider.js';

export type MyRecentTaskLoader = {
  listMyTasks(input: {
    userId: string;
    limit: number;
    sortBy: 'updatedAt' | 'priority' | 'dueDate';
  }): Promise<Array<{ taskId: string; title: string; status: TaskStatus; priority: Priority; version: number; hasChildren: boolean }>>;
};

export type SortKey = 'updatedAt' | 'priority' | 'dueDate';

export class MyRecentTasksProvider {
  private readonly listeners = new Set<() => void>();
  private sortBy: SortKey = 'updatedAt';

  public constructor(
    private readonly loader: MyRecentTaskLoader,
    private readonly userId: string
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

  public async getChildren(parent?: TaskTreeItem): Promise<TaskTreeItem[]> {
    if (parent) {
      return [];
    }

    const tasks = await this.loader.listMyTasks({ userId: this.userId, limit: 5, sortBy: this.sortBy });
    return tasks.map(task => ({
      id: task.taskId,
      label: task.title,
      kind: 'task',
      status: task.status,
      priority: task.priority,
      hasChildren: task.hasChildren
    }));
  }
}
