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

    expect(executeCommand).toHaveBeenCalledWith('taskDock.createTask', expect.objectContaining({ projectId: 'p1', priority: 'high', tags: ['a'] }));
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
  });
});
