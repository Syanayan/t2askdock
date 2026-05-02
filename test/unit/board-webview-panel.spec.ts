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

  it('uses VSCode theme variables and flat style tokens', () => {
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
    panel.render({ title: '', webview }, []);

    expect(webview.html).toContain('var(--vscode-editor-background)');
    expect(webview.html).toContain('var(--vscode-editor-foreground)');
    expect(webview.html).toContain('var(--vscode-panel-border)');
    expect(webview.html).toContain('var(--vscode-sideBar-background)');
    expect(webview.html).toContain('if(hasChildren&&isOpen)addRows');
    expect(webview.html).toContain('.task{border:1px solid var(--vscode-panel-border)');
    expect(webview.html).not.toContain('transform:translateY(-1px)');
  });

  it('includes keyboard add shortcuts and blank cancel behavior in inline create UI', () => {
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
    panel.render({ title: '', webview }, []);

    expect(webview.html).toContain("if((event.ctrlKey||event.metaKey)&&event.key==='Enter')");
    expect(webview.html).toContain("if(!title){resetInline(inline);return;}");
    expect(webview.html).toContain("if(event.key==='Escape'){event.preventDefault();resetInline(inline);}");
  });

  it('uses themed styles for card menu popup and menu trigger', () => {
    const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
    const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
    panel.render({ title: '', webview }, []);

    expect(webview.html).toContain('.card-menu-btn');
    expect(webview.html).toContain('.card-menu-popup');
    expect(webview.html).toContain('var(--vscode-menu-background)');
    expect(webview.html).toContain("type:'card:menuAction'");
  });
});
