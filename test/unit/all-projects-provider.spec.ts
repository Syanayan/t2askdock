import { describe, expect, it, vi } from 'vitest';
import { AllProjectsProvider } from '../../src/ui/tree/all-projects-provider.js';

describe('AllProjectsProvider', () => {
  it('loads projects at root and applies default sort/filter for tasks', async () => {
    const loader = {
      listProjects: vi.fn().mockResolvedValue([{ projectId: 'p1', projectName: 'P1' }]),
      listTasksByProject: vi.fn().mockResolvedValue([
        { taskId: 't1', title: 'active', status: 'todo', priority: 'medium', version: 1, hasChildren: false },
        { taskId: 't2', title: 'done', status: 'done', priority: 'high', version: 1, hasChildren: false }
      ]),
      listSubtasksByParent: vi.fn().mockResolvedValue([])
    };
    const provider = new AllProjectsProvider(loader as never);

    const projects = await provider.getChildren();
    expect(projects).toEqual([
      { id: 'p1', label: 'P1', kind: 'project', projectId: 'p1', hasChildren: true }
    ]);

    const tasks = await provider.getChildren(projects[0]);
    expect(loader.listTasksByProject).toHaveBeenCalledWith({ projectId: 'p1', offset: 0, limit: 5, sortBy: 'updatedAt', excludeDone: true });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('t1');
  });

  it('refreshes when sort changes and requests selected sort', async () => {
    const loader = {
      listProjects: vi.fn().mockResolvedValue([]),
      listTasksByProject: vi.fn().mockResolvedValue([]),
      listSubtasksByParent: vi.fn().mockResolvedValue([])
    };
    const provider = new AllProjectsProvider(loader as never);
    const listener = vi.fn();
    provider.onRefresh(listener);

    provider.setSort('priority');
    expect(listener).toHaveBeenCalledOnce();

    await provider.getChildren({ id: 'p1', label: 'P1', kind: 'project', hasChildren: true, projectId: 'p1' });
    expect(loader.listTasksByProject).toHaveBeenCalledWith({ projectId: 'p1', offset: 0, limit: 5, sortBy: 'priority', excludeDone: true });
  });

  it('toggles done-task visibility for tasks and subtasks', async () => {
    const loader = {
      listProjects: vi.fn().mockResolvedValue([]),
      listTasksByProject: vi.fn().mockResolvedValue([
        { taskId: 't1', title: 'active', status: 'todo', priority: 'medium', version: 1, hasChildren: true },
        { taskId: 't2', title: 'done', status: 'done', priority: 'high', version: 1, hasChildren: true }
      ]),
      listSubtasksByParent: vi.fn().mockResolvedValue([
        { taskId: 's1', title: 'sub-active', status: 'todo', priority: 'medium', version: 1, hasChildren: false },
        { taskId: 's2', title: 'sub-done', status: 'done', priority: 'high', version: 1, hasChildren: false }
      ])
    };
    const provider = new AllProjectsProvider(loader as never);

    const hiddenDone = await provider.getChildren({ id: 'p1', label: 'P1', kind: 'project', hasChildren: true, projectId: 'p1' });
    expect(hiddenDone.map(task => task.id)).toEqual(['t1']);
    expect(loader.listTasksByProject).toHaveBeenLastCalledWith({ projectId: 'p1', offset: 0, limit: 5, sortBy: 'updatedAt', excludeDone: true });

    provider.toggleDone();

    const shownDone = await provider.getChildren({ id: 'p1', label: 'P1', kind: 'project', hasChildren: true, projectId: 'p1' });
    expect(shownDone.map(task => task.id)).toEqual(['t1', 't2']);
    expect(loader.listTasksByProject).toHaveBeenLastCalledWith({ projectId: 'p1', offset: 0, limit: 5, sortBy: 'updatedAt', excludeDone: false });

    const shownSubtasks = await provider.getChildren({
      id: 't1',
      label: 'Task 1',
      kind: 'task',
      status: 'todo',
      priority: 'medium',
      hasChildren: true,
      projectId: 'p1'
    });
    expect(shownSubtasks.map(task => task.id)).toEqual(['s1', 's2']);
  });
});
