import { describe, expect, it, vi } from 'vitest';
import { TaskTableWebviewPanel } from '../../src/ui/webview/task-table-webview-panel.js';

describe('TaskTableWebviewPanel', () => {
  it('uses green highlight for selected rows and keeps status colors separate', async () => {
    const panel = new TaskTableWebviewPanel(
      { execute: vi.fn() } as never,
      { execute: vi.fn() } as never,
      async () => [],
      async () => null,
      async () => undefined
    );

    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn() };
    await panel.render({ title: '', webview });

    expect(webview.html).toContain('tr.selected{outline:2px solid #2e7d32');
    expect(webview.html).toContain('tr.selected td{background:rgba(46,125,50,.18)}');
    expect(webview.html).toContain('.status-done{background:#2e7d32}');
  });

  
  it('handles add/rename/archive category messages', async () => {
    const handlerRef: { current?: (message: unknown) => Promise<void> } = {};
    const addCategory = vi.fn();
    const renameCategory = vi.fn();
    const archiveCategory = vi.fn();
    const panel = new TaskTableWebviewPanel(
      { execute: vi.fn() } as never,
      { execute: vi.fn() } as never,
      async () => [],
      async () => null,
      async () => undefined,
      undefined,
      undefined,
      undefined,
      true,
      undefined,
      addCategory,
      renameCategory,
      archiveCategory
    );

    await panel.render({
      title: '',
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: (handler: (message: unknown) => Promise<void>) => {
          handlerRef.current = handler;
          return { dispose: () => undefined };
        }
      }
    });

    await handlerRef.current?.({ type: 'table:addCategory', name: 'New Cat' });
    await handlerRef.current?.({ type: 'table:renameCategory', projectId: 'p1', name: 'Renamed' });
    await handlerRef.current?.({ type: 'table:archiveCategory', projectId: 'p1' });

    expect(addCategory).toHaveBeenCalledWith('New Cat');
    expect(renameCategory).toHaveBeenCalledWith('p1', 'Renamed');
    expect(archiveCategory).toHaveBeenCalledWith('p1');
  });

  it('auto-calculates parent progress from children done ratio', async () => {
    const moveTaskStatusUseCase = { execute: vi.fn() };
    const updateTaskUseCase = { execute: vi.fn() };
    const handlerRef: { current?: (message: unknown) => Promise<void> } = {};
    const postMessage = vi.fn();

    const panel = new TaskTableWebviewPanel(
      moveTaskStatusUseCase as never,
      updateTaskUseCase as never,
      async () => [
        {
          taskId: 'parent',
          projectId: 'p1',
          title: 'parent',
          status: 'todo',
          priority: 'medium',
          assignee: null,
          progress: 0,
          version: 1,
          children: [
            { taskId: 'c1', title: 'c1', status: 'done', priority: 'medium', assignee: null, progress: 0, version: 1, children: [] },
            { taskId: 'c2', title: 'c2', status: 'todo', priority: 'medium', assignee: null, progress: 0, version: 1, children: [] }
          ]
        }
      ] as never,
      async () => null,
      async () => undefined
    );

    await panel.render({
      title: '',
      webview: {
        html: '',
        postMessage,
        onDidReceiveMessage: (handler: (message: unknown) => Promise<void>) => {
          handlerRef.current = handler;
          return { dispose: () => undefined };
        }
      }
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'table:init',
        tasks: [expect.objectContaining({ taskId: 'parent', progress: 50 })]
      })
    );
  });

  it('updates progress from table message', async () => {
    const moveTaskStatusUseCase = { execute: vi.fn() };
    const updateTaskUseCase = { execute: vi.fn().mockResolvedValue({ id: 't1', title: 'task', status: 'todo', version: 2 }) };
    const handlerRef: { current?: (message: unknown) => Promise<void> } = {};

    const panel = new TaskTableWebviewPanel(
      moveTaskStatusUseCase as never,
      updateTaskUseCase as never,
      async () => [],
      async () => ({
        taskId: 't1',
        projectId: 'p1',
        title: 'task',
        status: 'todo',
        priority: 'medium',
        assignee: null,
        dueDate: null,
        tags: [],
        description: null,
        parentTaskId: null,
        version: 1,
        progress: 0
      }),
      async () => undefined
    );

    await panel.render({
      title: '',
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: (handler: (message: unknown) => Promise<void>) => {
          handlerRef.current = handler;
          return { dispose: () => undefined };
        }
      }
    });

    await handlerRef.current?.({ type: 'table:updateProgress', taskId: 't1', progress: 70, expectedVersion: 1 });

    expect(updateTaskUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', progress: 70, expectedVersion: 1 })
    );
  });

  it('archives selected done/closed tasks from table message', async () => {
    const updateTaskUseCase = { execute: vi.fn().mockResolvedValue({ id: 't1', title: 'task', status: 'done', version: 2 }) };
    const handlerRef: { current?: (message: unknown) => Promise<void> } = {};

    const detailById: Record<string, any> = {
      t1: { taskId: 't1', projectId: 'p1', title: 'done', status: 'done', priority: 'medium', assignee: null, dueDate: null, tags: [], description: null, parentTaskId: null, version: 1, progress: 100, isClosed: false, isArchived: false, closeReason: null },
      t2: { taskId: 't2', projectId: 'p1', title: 'closed', status: 'todo', priority: 'medium', assignee: null, dueDate: null, tags: [], description: null, parentTaskId: null, version: 2, progress: 50, isClosed: true, isArchived: false, closeReason: 'dup' },
      t3: { taskId: 't3', projectId: 'p1', title: 'todo', status: 'todo', priority: 'medium', assignee: null, dueDate: null, tags: [], description: null, parentTaskId: null, version: 3, progress: 10, isClosed: false, isArchived: false, closeReason: null }
    };

    const panel = new TaskTableWebviewPanel(
      { execute: vi.fn() } as never,
      updateTaskUseCase as never,
      async () => [],
      async (taskId) => detailById[taskId] ?? null,
      async () => undefined
    );

    await panel.render({
      title: '',
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: (handler: (message: unknown) => Promise<void>) => {
          handlerRef.current = handler;
          return { dispose: () => undefined };
        }
      }
    });

    await handlerRef.current?.({ type: 'table:archiveTasks', taskIds: ['t1', 't2', 't3'] });

    expect(updateTaskUseCase.execute).toHaveBeenCalledTimes(2);
    expect(updateTaskUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't1', isArchived: true }));
    expect(updateTaskUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't2', isArchived: true }));
  });
});
