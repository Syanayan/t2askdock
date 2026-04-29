import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UiEventBus } from '../events/ui-event-bus.js';
import type * as vscode from 'vscode';

type BoardTask = {
  taskId: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  description: string | null;
  assignee: string | null;
  dueDate: string | null;
  tags: string[];
  parentTaskId: string | null;
  version: number;
};

export class BoardWebviewPanel {
  public static readonly VIEW_TYPE = 'taskDock.boardView';

  public constructor(
    private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
    private readonly eventBus: UiEventBus
  ) {}

  public render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>, tasks: BoardTask[]): void {
    panel.title = 'Task Dock Board';
    panel.webview.html = this.buildHtml();
    panel.webview.onDidReceiveMessage?.(async (message: unknown) => {
      if (!isDropMessage(message)) {
        return;
      }
      await this.onDrop({
        ...message.task,
        toStatus: message.toStatus,
        actorId: 'system',
        now: new Date().toISOString()
      });
    });
    void panel.webview.postMessage?.({ type: 'board:init', tasks });
  }

  private buildHtml(): string {
    return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Task Dock Board</title>
    <style>
      body { font-family: sans-serif; margin: 16px; }
      .hint { color: #666; font-size: 12px; }
      .board { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; margin-top: 12px; }
      .column { border: 1px solid #ddd; border-radius: 6px; padding: 8px; min-height: 120px; }
      .column h3 { margin: 0 0 6px 0; font-size: 13px; }
      .task { border: 1px solid #ccc; border-radius: 4px; padding: 6px; margin-bottom: 6px; background: #fff; cursor: grab; }
    </style>
  </head>
  <body>
    <h2>Task Board</h2>
    <p class="hint">カードをドラッグ&ドロップして状態を更新できます。</p>
    <section class="board">
      <article class="column" data-status="todo"><h3>Todo</h3><div class="tasks"></div></article>
      <article class="column" data-status="in_progress"><h3>In Progress</h3><div class="tasks"></div></article>
      <article class="column" data-status="blocked"><h3>Blocked</h3><div class="tasks"></div></article>
      <article class="column" data-status="done"><h3>Done</h3><div class="tasks"></div></article>
    </section>
    <script>
      const vscode = acquireVsCodeApi();
      let tasks = [];
      const statuses = ['todo', 'in_progress', 'blocked', 'done'];
      const render = () => {
        for (const status of statuses) {
          const list = document.querySelector('.column[data-status="' + status + '"] .tasks');
          list.innerHTML = '';
          for (const task of tasks.filter(t => t.status === status)) {
            const el = document.createElement('div');
            el.className = 'task';
            el.textContent = task.title;
            el.draggable = true;
            el.dataset.taskId = task.taskId;
            el.addEventListener('dragstart', () => el.dataset.dragging = 'true');
            el.addEventListener('dragend', () => delete el.dataset.dragging);
            list.appendChild(el);
          }
        }
      };

      document.querySelectorAll('.column').forEach(column => {
        column.addEventListener('dragover', (event) => event.preventDefault());
        column.addEventListener('drop', () => {
          const dragging = document.querySelector('.task[data-dragging="true"]');
          if (!dragging) return;
          const task = tasks.find(t => t.taskId === dragging.dataset.taskId);
          if (!task) return;
          const toStatus = column.dataset.status;
          if (task.status === toStatus) return;
          vscode.postMessage({ type: 'board:drop', task, toStatus });
          task.status = toStatus;
          task.version += 1;
          render();
        });
      });
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'board:init') {
          tasks = event.data.tasks ?? [];
          render();
        }
      });
    </script>
  </body>
</html>`;
  }

  public async onDrop(input: {
    taskId: string;
    projectId: string;
    actorId: string;
    toStatus: TaskStatus;
    title: string;
    description: string | null;
    priority: Priority;
    assignee: string | null;
    dueDate: string | null;
    tags: string[];
    parentTaskId: string | null;
    expectedVersion: number;
    now: string;
  }): Promise<{ taskId: string; status: TaskStatus; version: number }> {
    const output = await this.moveTaskStatusUseCase.execute({
      taskId: input.taskId,
      projectId: input.projectId,
      actorId: input.actorId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      assignee: input.assignee,
      dueDate: input.dueDate,
      tags: input.tags,
      parentTaskId: input.parentTaskId,
      expectedVersion: input.expectedVersion,
      now: input.now,
      toStatus: input.toStatus
    });

    this.eventBus.publish({
      type: 'TASK_UPDATED',
      payload: { taskId: output.id, status: output.status, version: output.version }
    });

    return { taskId: output.id, status: output.status, version: output.version };
  }
}

function isDropMessage(
  value: unknown
): value is { type: 'board:drop'; task: Omit<Parameters<BoardWebviewPanel['onDrop']>[0], 'toStatus' | 'actorId' | 'now'>; toStatus: TaskStatus } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'board:drop' && typeof candidate.toStatus === 'string' && typeof candidate.task === 'object';
}
