import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  TreeItem: class {
    public command: unknown;
    public iconPath: unknown;
    public description: unknown;
    public tooltip: unknown;
    public contextValue: unknown;
    public collapsibleState: number;
    constructor(public label: string, collapsibleState: number) {
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
  ThemeIcon: class { constructor(public id: string, public color?: unknown) {} },
  ThemeColor: class { constructor(public id: string) {} }
}));

import { makeAllProjectsTreeItem } from '../../src/ui/tree/all-projects-tree-item-factory.js';

describe('makeAllProjectsTreeItem', () => {
  describe('project item', () => {
    it('uses taskDock.openProjectTable command', () => {
      const element = { id: 'p1', label: 'Project 1', kind: 'project' as const, projectId: 'p1', hasChildren: true };
      const item = makeAllProjectsTreeItem(element);
      expect(item.command).toMatchObject({ command: 'taskDock.openProjectTable' });
    });

    it('passes projectId, profileId, projectName in command arguments', () => {
      const element = { id: 'p1', label: 'My Cat', kind: 'project' as const, projectId: 'p1', profileId: 'db1', hasChildren: true };
      const item = makeAllProjectsTreeItem(element);
      expect(item.command?.arguments?.[0]).toEqual({ projectId: 'p1', profileId: 'db1', projectName: 'My Cat' });
    });

    it('sets tooltip to カテゴリ: <label>', () => {
      const element = { id: 'p1', label: 'Foo', kind: 'project' as const, projectId: 'p1', hasChildren: true };
      const item = makeAllProjectsTreeItem(element);
      expect(item.tooltip).toBe('カテゴリ: Foo');
    });

    it('sets contextValue to project', () => {
      const element = { id: 'p1', label: 'Foo', kind: 'project' as const, projectId: 'p1', hasChildren: true };
      const item = makeAllProjectsTreeItem(element);
      expect(item.contextValue).toBe('project');
    });
  });

  describe('database item', () => {
    it('has no click command when available (expands/collapses only)', () => {
      const element = { id: 'db1', label: 'DB1', kind: 'database' as const, profileId: 'db1', hasChildren: true, available: true };
      const item = makeAllProjectsTreeItem(element);
      expect(item.command).toBeUndefined();
    });

    it('has no command when unavailable', () => {
      const element = { id: 'db1', label: 'DB1', kind: 'database' as const, profileId: 'db1', hasChildren: false, available: false };
      const item = makeAllProjectsTreeItem(element);
      expect(item.command).toBeUndefined();
    });

    it('shows 接続不可 description when unavailable', () => {
      const element = { id: 'db1', label: 'DB1', kind: 'database' as const, profileId: 'db1', hasChildren: false, available: false };
      const item = makeAllProjectsTreeItem(element);
      expect(item.description).toBe('(接続不可)');
    });

    it('sets contextValue to database', () => {
      const element = { id: 'db1', label: 'DB1', kind: 'database' as const, profileId: 'db1', hasChildren: true, available: true };
      const item = makeAllProjectsTreeItem(element);
      expect(item.contextValue).toBe('database');
    });
  });

  describe('task item', () => {
    it('uses taskDock.openTaskDetail command', () => {
      const element = { id: 't1', label: 'Task', kind: 'task' as const, status: 'todo' as const, priority: 'medium' as const, hasChildren: false, projectId: 'p1' };
      const item = makeAllProjectsTreeItem(element);
      expect(item.command).toMatchObject({ command: 'taskDock.openTaskDetail' });
    });

    it('passes the element itself as command argument', () => {
      const element = { id: 't1', label: 'Task', kind: 'task' as const, status: 'todo' as const, priority: 'medium' as const, hasChildren: false, projectId: 'p1' };
      const item = makeAllProjectsTreeItem(element);
      expect(item.command?.arguments?.[0]).toBe(element);
    });

    it('sets status description', () => {
      const element = { id: 't1', label: 'Task', kind: 'task' as const, status: 'in_progress' as const, priority: 'high' as const, hasChildren: false, projectId: 'p1' };
      const item = makeAllProjectsTreeItem(element);
      expect(item.description).toBe('[in_progress]');
    });

    it('sets contextValue to task', () => {
      const element = { id: 't1', label: 'Task', kind: 'task' as const, status: 'todo' as const, priority: 'low' as const, hasChildren: false, projectId: 'p1' };
      const item = makeAllProjectsTreeItem(element);
      expect(item.contextValue).toBe('task');
    });
  });

  describe('subtask item', () => {
    it('uses taskDock.openTaskDetail command', () => {
      const element = { id: 's1', label: 'Sub', kind: 'subtask' as const, status: 'done' as const, priority: 'low' as const, hasChildren: false, projectId: 'p1' };
      const item = makeAllProjectsTreeItem(element);
      expect(item.command).toMatchObject({ command: 'taskDock.openTaskDetail' });
    });

    it('sets contextValue to subtask', () => {
      const element = { id: 's1', label: 'Sub', kind: 'subtask' as const, status: 'done' as const, priority: 'low' as const, hasChildren: false, projectId: 'p1' };
      const item = makeAllProjectsTreeItem(element);
      expect(item.contextValue).toBe('subtask');
    });
  });
});
