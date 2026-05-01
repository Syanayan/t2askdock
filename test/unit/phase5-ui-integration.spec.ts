import { describe, expect, it, vi } from 'vitest';
import { TaskDockCommandRegistry } from '../../src/ui/commands/command-registry.js';
import { UiEventBus } from '../../src/ui/events/ui-event-bus.js';
import { ArchiveAuditSearchPanel } from '../../src/ui/panels/archive-audit-search-panel.js';
import { CommentThreadPanel } from '../../src/ui/panels/comment-thread-panel.js';
import { ConnectorManagementPanel } from '../../src/ui/panels/connector-management-panel.js';
import { FeatureFlagManagementPanel } from '../../src/ui/panels/feature-flag-management-panel.js';
import { ExtensionStateStore } from '../../src/ui/state/extension-state-store.js';
import { StatusBarController } from '../../src/ui/status/status-bar-controller.js';
import { TaskTreeViewProvider } from '../../src/ui/tree/task-tree-view-provider.js';
import { MyRecentTasksProvider } from '../../src/ui/tree/my-recent-tasks-provider.js';
import { BoardWebviewPanel } from '../../src/ui/webview/board-webview-panel.js';

describe('Phase5 UI integration', () => {
  it('registers open/select/create/toggle commands and updates state/events', async () => {
    const createTaskUseCase = { execute: vi.fn().mockResolvedValue({ id: 't1', title: 'task' }) };
    const switchDatabaseProfileUseCase = {
      execute: vi.fn().mockResolvedValue({
        profileSummary: { profileId: 'main', path: '/tmp/main.db' },
        connectionMode: 'readOnly',
        healthStatus: 'degraded'
      })
    };
    const setReadOnlyModeUseCase = { execute: vi.fn().mockResolvedValue({ mode: 'readWrite' }) };

    const stateStore = new ExtensionStateStore();
    const eventBus = new UiEventBus();
    const taskUpdated = vi.fn();
    eventBus.subscribe('TASK_UPDATED', taskUpdated);

    const registry = new TaskDockCommandRegistry(
      createTaskUseCase as never,
      switchDatabaseProfileUseCase as never,
      setReadOnlyModeUseCase as never,
      stateStore,
      eventBus
    );
    const commands = registry.register();

    expect(commands['taskDock.openTree']()).toEqual({ viewId: 'taskDock.treeView' });
    expect(commands['taskDock.openBoard']()).toEqual({ viewId: 'taskDock.boardView' });

    await commands['taskDock.selectDatabase']({ profileId: 'main' });
    await commands['taskDock.toggleReadOnly']({ profileId: 'main', enabled: false, actorRole: 'admin' });
    await commands['taskDock.createTask']({
      taskId: 't1',
      projectId: 'p1',
      title: 'task',
      description: null,
      status: 'todo',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      tags: [],
      parentTaskId: null,
      actorId: 'u1',
      now: '2026-04-27T00:00:00.000Z'
    });

    expect(stateStore.getState()).toMatchObject({ activeProfile: 'main', connectionMode: 'readWrite', healthStatus: 'degraded' });
    expect(taskUpdated).toHaveBeenCalledOnce();
  });

  it('supports lazy loading tree nodes', async () => {
    const listProjects = vi.fn().mockResolvedValue([{ projectId: 'p1', projectName: 'Main' }]);
    const listTasksByProject = vi
      .fn()
      .mockResolvedValue([{ taskId: 't1', title: 'todo', status: 'todo', priority: 'medium', hasChildren: false }]);
    const listSubtasksByParent = vi.fn().mockResolvedValue([]);
    const provider = new TaskTreeViewProvider({
      listProjects,
      listTasksByProject,
      listSubtasksByParent
    }, 25);

    expect(await provider.getChildren()).toEqual([{ id: 'p1', label: 'Main', kind: 'project', projectId: 'p1', hasChildren: true }]);
    expect(await provider.getChildren({ kind: 'project', id: 'p1', label: 'Main', hasChildren: true })).toEqual([
      { id: 't1', label: 'todo', kind: 'task', status: 'todo', priority: 'medium', projectId: 'p1', hasChildren: false }
    ]);
    expect(listProjects).toHaveBeenCalledOnce();
    expect(listTasksByProject).toHaveBeenCalledWith({ projectId: 'p1', offset: 0, limit: 25 });
  });

  it('supports my recent tasks with sort updates', async () => {
    const listMyTasks = vi.fn().mockResolvedValue([{ taskId: 't1', projectId: 'p1', title: 'mine', status: 'todo', priority: 'high', version: 1, hasChildren: false }]);
    const listSubtasksByParent = vi.fn().mockResolvedValue([]);
    const provider = new MyRecentTasksProvider({ listMyTasks, listSubtasksByParent }, 'u1');
    const refresh = vi.fn();
    provider.onRefresh(refresh);

    expect(await provider.getChildren()).toEqual([
      { id: 't1', label: 'mine', kind: 'task', status: 'todo', priority: 'high', projectId: 'p1', hasChildren: false }
    ]);
    expect(listMyTasks).toHaveBeenCalledWith({ userId: 'u1', limit: 5, sortBy: 'updatedAt' });

    provider.setSort('priority');
    expect(refresh).toHaveBeenCalledOnce();
    await provider.getChildren();
    expect(listMyTasks).toHaveBeenLastCalledWith({ userId: 'u1', limit: 5, sortBy: 'priority' });
  });

  it('moves status by D&D and publishes update event', async () => {
    const moveTaskStatusUseCase = { execute: vi.fn().mockResolvedValue({ id: 't1', status: 'done', version: 2 }) };
    const bus = new UiEventBus();
    const taskUpdated = vi.fn();
    bus.subscribe('TASK_UPDATED', taskUpdated);
    const panel = new BoardWebviewPanel(moveTaskStatusUseCase as never, bus);

    const output = await panel.onDrop({
      taskId: 't1',
      projectId: 'p1',
      actorId: 'u1',
      toStatus: 'done',
      title: 'title',
      description: null,
      priority: 'medium',
      assignee: null,
      dueDate: null,
      tags: [],
      parentTaskId: null,
      expectedVersion: 1,
      now: '2026-04-27T00:00:00.000Z'
    });

    expect(output).toEqual({ taskId: 't1', status: 'done', version: 2 });
    expect(taskUpdated).toHaveBeenCalledOnce();
  });


  it('renders enhanced board html and handles card menu command delegation', async () => {
    const moveTaskStatusUseCase = { execute: vi.fn() };
    const bus = new UiEventBus();
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const panel = new BoardWebviewPanel(moveTaskStatusUseCase as never, bus, executeCommand);

    let handler: ((m: unknown) => Promise<void>) | undefined;
    const postMessage = vi.fn();
    const fakePanel = {
      title: '',
      webview: {
        html: '',
          onDidReceiveMessage: (cb: (m: unknown) => Promise<void>) => {
            handler = cb;
            return { dispose: () => undefined } as never;
          },
          postMessage
        }
    };
    panel.render(fakePanel as never, [
        {
          taskId: 't1',
          projectId: 'p1',
          title: 'Task',
          status: 'todo',
          priority: 'high',
          description: 'desc',
          assignee: null,
          dueDate: null,
          tags: ['ui'],
          parentTaskId: null,
          version: 1
        }
      ]
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'board:init',
      tasks: [expect.objectContaining({ sequenceNumber: 1 })]
    });
    expect(fakePanel.webview.html).toContain('count-badge');
    expect(fakePanel.webview.html).toContain('toolbar');
    expect(fakePanel.webview.html).toContain('column-menu');
    expect(fakePanel.webview.html).toContain('inline-create');

    await handler?.({ type: 'card:menu', action: 'edit', taskId: 't1' });
    await handler?.({ type: 'card:create', status: 'todo' });
    await handler?.({ type: 'card:create', status: 'done', title: 'quick create' });
    expect(executeCommand).toHaveBeenCalledWith('taskDock.updateTask', { taskId: 't1' });
    expect(executeCommand).toHaveBeenCalledWith('taskDock.createTask', { status: 'todo' });
    expect(executeCommand).toHaveBeenCalledWith('taskDock.createTask', { status: 'done', title: 'quick create' });
  });
  it('supports comment thread list/add/update/delete', async () => {
    const panel = new CommentThreadPanel(
      { execute: vi.fn().mockResolvedValue([{ commentId: 'c1' }]) } as never,
      { execute: vi.fn().mockResolvedValue({ commentId: 'c1', body: 'new' }) } as never,
      { execute: vi.fn().mockResolvedValue({ commentId: 'c1', body: 'edit' }) } as never,
      { execute: vi.fn().mockResolvedValue({ commentId: 'c1', deletedAt: '2026-04-27T00:00:00.000Z' }) } as never
    );

    expect(await panel.list('t1')).toHaveLength(1);
    expect((await panel.add({ commentId: 'c1', taskId: 't1', body: 'new', actorId: 'u1', now: '2026-04-27T00:00:00.000Z' })).body).toBe('new');
    await panel.update({ commentId: 'c1', taskId: 't1', body: 'edit', actorId: 'u1', now: '2026-04-27T00:00:00.000Z', expectedVersion: 1 });
    await panel.softDelete({ commentId: 'c1', actorId: 'u1', now: '2026-04-27T00:00:00.000Z', expectedVersion: 2 });
  });

  it('builds status bar summary for db/mode/health', () => {
    const stateStore = new ExtensionStateStore();
    stateStore.patch({ activeProfile: 'main', connectionMode: 'readOnly', healthStatus: 'unreachable' });
    const controller = new StatusBarController(stateStore);

    expect(controller.snapshot()).toEqual({
      db: 'DB:main',
      mode: 'Mode:RO',
      health: 'Health:Unsafe',
      reconnectCommand: 'taskDock.selectDatabase'
    });
  });

  it('supports audit archive search + purge dry-run/execution flow', async () => {
    const search = vi.fn().mockResolvedValue([{ source: 'archive', logId: 'a1', actionType: 'TASK_UPDATED', createdAt: '2026-01-01T00:00:00.000Z' }]);
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ affectedRows: 12 })
      .mockResolvedValueOnce({ affectedRows: 12 });
    const bus = new UiEventBus();
    const panel = new ArchiveAuditSearchPanel({ search }, { execute }, bus);

    const searchOutput = await panel.search({ from: '2025-01-01T00:00:00.000Z', to: '2025-05-01T00:00:00.000Z' });
    const dryRun = await panel.purgeDryRun({ from: '2025-01-01T00:00:00.000Z', to: '2025-05-01T00:00:00.000Z', actorId: 'admin' });
    const actual = await panel.purgeExecute({ from: '2025-01-01T00:00:00.000Z', to: '2025-05-01T00:00:00.000Z', actorId: 'admin', actorRole: 'admin', approved: true });

    expect(searchOutput.includeArchive).toBe(true);
    expect(searchOutput.searchMode).toBe('cross_archive');
    expect(dryRun.affectedRows).toBe(12);
    expect(actual.affectedRows).toBe(12);
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ dryRun: true }));
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ dryRun: false }));
  });

  it('supports feature flag scope display/update and connector setting linkage', async () => {
    const setFeatureFlagUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
    const featurePanel = new FeatureFlagManagementPanel(setFeatureFlagUseCase as never);

    await featurePanel.update({
      flagKey: 'connector.jira.enabled',
      enabled: true,
      scopeType: 'profile',
      scopeId: 'main',
      updatedBy: 'admin',
      now: '2026-04-27T00:00:00.000Z'
    });

    expect(featurePanel.getScopeLabel({ scopeType: 'profile', scopeId: 'main' })).toBe('profile:main');

    const connectorPanel = new ConnectorManagementPanel(
      { execute: vi.fn().mockResolvedValue({ enabled: false }) } as never,
      { execute: vi.fn().mockRejectedValueOnce(new Error('E_CONNECTOR_SECRET_MISSING')).mockResolvedValue({ secretRef: 'sec_2' }) } as never
    );

    const settingResult = await connectorPanel.updateSettings({
      connectorId: 'jira',
      profileId: 'main',
      actorId: 'admin',
      authType: 'oauth',
      settingsJson: '{}',
      secretRef: null,
      syncPolicy: 'manual',
      now: '2026-04-27T00:00:00.000Z'
    });
    const mismatchResult = await connectorPanel.rotateSecret({ connectorId: 'jira', profileId: 'main', updatedBy: 'admin', now: '2026-04-27T00:00:00.000Z' });
    const rotatedResult = await connectorPanel.rotateSecret({ connectorId: 'jira', profileId: 'main', updatedBy: 'admin', now: '2026-04-27T00:00:00.000Z' });

    expect(settingResult).toEqual({ enabled: false });
    expect(mismatchResult).toEqual({ secretRef: 'missing', hasMismatch: true });
    expect(rotatedResult).toEqual({ secretRef: 'sec_2', hasMismatch: false });
  });
});
