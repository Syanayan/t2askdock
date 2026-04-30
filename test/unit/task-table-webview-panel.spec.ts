import { describe, expect, it, vi } from 'vitest';
import { TaskTableWebviewPanel } from '../../src/ui/webview/task-table-webview-panel.js';

describe('TaskTableWebviewPanel', () => {
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
});
