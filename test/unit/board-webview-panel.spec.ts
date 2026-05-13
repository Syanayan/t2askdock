import { describe, expect, it, vi } from 'vitest';
import { BoardWebviewPanel } from '../../src/ui/webview/board-webview-panel.js';

describe('BoardWebviewPanel', () => {
  it('passes full create payload and projectId to createTask command', async () => {
    const handlerRef: { current?: (m: unknown) => Promise<void> } = {};
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, executeCommand);

    panel.render({
      title: '',
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: (h: (m: unknown) => Promise<void>) => { handlerRef.current = h; return { dispose: () => undefined }; }
      }
    }, [{ taskId: 't1', projectId: 'p1', title: 't', status: 'todo', priority: 'medium', description: null, assignee: null, dueDate: null, tags: [], parentTaskId: null, version: 1 }]);

    await handlerRef.current?.({ type: 'card:create', status: 'todo', title: 'x', projectId: 'p1', priority: 'high', assignee: 'me', dueDate: '2026-01-01', tags: ['a'] });

    expect(executeCommand).toHaveBeenCalledWith('taskDock.openTaskCreate', expect.objectContaining({ projectId: 'p1', status: 'todo' }));
  });

  it('opens task detail when card:open message arrives', async () => {
    const handlerRef: { current?: (m: unknown) => Promise<void> } = {};
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, executeCommand);

    panel.render({
      title: '',
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: (h: (m: unknown) => Promise<void>) => { handlerRef.current = h; return { dispose: () => undefined }; }
      }
    }, []);

    await handlerRef.current?.({ type: 'card:open', taskId: 't-open' });
    expect(executeCommand).toHaveBeenCalledWith('taskDock.openTaskDetail', { taskId: 't-open' });

    await handlerRef.current?.({ type: 'card:menuAction', action: 'edit', taskId: 't-open' });
    expect(executeCommand).toHaveBeenCalledWith('taskDock.updateTask', expect.objectContaining({ id: 't-open', kind: 'task' }));
  });

  it('disposes previous webview message listener before re-registering', async () => {
    const handlerRef: { current?: (m: unknown) => Promise<void> } = {};
    const disposeFirst = vi.fn();
    const onDidReceiveMessage = vi
      .fn()
      .mockImplementationOnce((h: (m: unknown) => Promise<void>) => { handlerRef.current = h; return { dispose: disposeFirst }; })
      .mockImplementationOnce((h: (m: unknown) => Promise<void>) => { handlerRef.current = h; return { dispose: vi.fn() }; });
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage };

    panel.render({ title: '', webview }, []);
    panel.render({ title: '', webview }, []);

    expect(disposeFirst).toHaveBeenCalledTimes(1);
    expect(onDidReceiveMessage).toHaveBeenCalledTimes(2);
  });

  it('uses VSCode theme variables and modern card styles', () => {
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
    panel.render({ title: '', webview }, []);

    expect(webview.html).toContain('var(--vscode-editor-background)');
    expect(webview.html).toContain('var(--vscode-editor-foreground)');
    expect(webview.html).toContain('var(--vscode-panel-border)');
    expect(webview.html).toContain('var(--vscode-sideBar-background)');
    expect(webview.html).toContain('.task-card{background:var(--vscode-editor-background)');
    expect(webview.html).not.toContain('transform:translateY(-1px)');
    expect(webview.html).not.toContain('.card-menu-btn');
  });

  it('includes Add Task action button in top toolbar', () => {
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
    panel.render({ title: '', webview }, []);

    expect(webview.html).toContain('id="add-task"');
    expect(webview.html).not.toContain('inline-create');
  });

  it('uses priority-colored card borders and badge styles', () => {
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
    panel.render({ title: '', webview }, []);

    expect(webview.html).toContain('.task-card[data-priority="critical"]{border-left-color:#f87171}');
    expect(webview.html).toContain('.pb-critical{background:rgba(239,68,68,.12)');
    expect(webview.html).toContain('.pb-high{background:rgba(249,115,22,.12)');
    expect(webview.html).toContain('.sb-todo{background:rgba(59,130,246,.1)');
    expect(webview.html).toContain('class="app-header"');
    expect(webview.html).toContain('class="board-wrap"');
  });

  it('normalizes nested tasks from board:init so subtasks appear in kanban columns', () => {
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
    panel.render({ title: '', webview }, []);

    expect(webview.html).toContain('const normalizeTreeTasks=(nodes,parentId=null)=>');
    expect(webview.html).toContain('tasks=normalizeTreeTasks(e.data.tasks??[])');
  });

});
