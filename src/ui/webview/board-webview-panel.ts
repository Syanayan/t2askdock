import type * as vscode from 'vscode';
import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UiEventBus } from '../events/ui-event-bus.js';

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
  sequenceNumber?: number;
};

export class BoardWebviewPanel {
  public static readonly VIEW_TYPE = 'taskDock.boardView';

  public constructor(
    private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
    private readonly eventBus: UiEventBus,
    private readonly executeCommand: (command: string, args: { taskId: string }) => Promise<unknown> = async () => undefined
  ) {}

  public render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>, tasks: BoardTask[]): void {
    panel.title = 'Task Dock Board';
    panel.webview.html = this.buildHtml();
    panel.webview.onDidReceiveMessage?.(async (message: unknown) => {
      if (isDropMessage(message)) {
        await this.onDrop({
          ...message.task,
          toStatus: message.toStatus,
          actorId: 'system',
          now: new Date().toISOString()
        });
        return;
      }
      if (isCardMenuMessage(message)) {
        const command = message.action === 'edit' ? 'taskDock.updateTask' : 'taskDock.deleteTask';
        await this.executeCommand(command, { taskId: message.taskId });
      }
    });
    void panel.webview.postMessage?.({
      type: 'board:init',
      tasks: tasks.map((task, index) => ({ ...task, sequenceNumber: task.sequenceNumber ?? index + 1 }))
    });
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
      .column { border: 1px solid #ddd; border-radius: 6px; padding: 8px; min-height: 120px; border-top-width: 4px; }
      .column[data-status="todo"] { border-top-color: #2196F3; }
      .column[data-status="in_progress"] { border-top-color: #4CAF50; }
      .column[data-status="blocked"] { border-top-color: #F44336; }
      .column[data-status="done"] { border-top-color: #9C27B0; }
      .column-header { display:flex; justify-content: space-between; align-items:center; margin-bottom: 6px; }
      .column h3 { margin: 0; font-size: 13px; }
      .count-badge { font-size: 11px; border-radius: 999px; background: #eee; padding: 1px 6px; }
      .add-task { width: 100%; margin-bottom: 8px; border: 1px dashed #bbb; background: #fafafa; border-radius: 4px; padding: 4px; font-size: 12px; cursor: pointer; }
      .task { border: 1px solid #ccc; border-radius: 4px; padding: 6px; margin-bottom: 6px; background: #fff; cursor: grab; }
      .task-header { display:flex; justify-content: space-between; align-items:center; margin-bottom: 4px; }
      .task-seq { font-size: 11px; color: #555; }
      .task-desc { font-size: 12px; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 4px 0; }
      .task-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
      .badge { font-size: 11px; border-radius: 10px; padding: 2px 6px; }
      .priority-low { background: #f0f0f0; color: #666; }
      .priority-high { background: #ffedd5; color: #9a3412; }
      .priority-critical { background: #fee2e2; color: #991b1b; }
      .due-overdue { color: #b91c1c; }
    </style>
  </head>
  <body>
    <h2>Task Board</h2>
    <p class="hint">カードをドラッグ&ドロップして状態を更新できます。</p>
    <section class="board">
      <article class="column" data-status="todo"><div class="column-header"><h3>Todo <span class="count-badge">0</span></h3></div><button class="add-task" type="button">+ タスクを追加</button><div class="tasks"></div></article>
      <article class="column" data-status="in_progress"><div class="column-header"><h3>In Progress <span class="count-badge">0</span></h3></div><button class="add-task" type="button">+ タスクを追加</button><div class="tasks"></div></article>
      <article class="column" data-status="blocked"><div class="column-header"><h3>Blocked <span class="count-badge">0</span></h3></div><button class="add-task" type="button">+ タスクを追加</button><div class="tasks"></div></article>
      <article class="column" data-status="done"><div class="column-header"><h3>Done <span class="count-badge">0</span></h3></div><button class="add-task" type="button">+ タスクを追加</button><div class="tasks"></div></article>
    </section>
    <script>
      const vscode = acquireVsCodeApi();
      let tasks = [];
      const statuses = ['todo', 'in_progress', 'blocked', 'done'];
      const render = () => {
        for (const status of statuses) {
          const inStatus = tasks.filter(t => t.status === status);
          const list = document.querySelector('.column[data-status="' + status + '"] .tasks');
          document.querySelector('.column[data-status="' + status + '"] .count-badge').textContent = String(inStatus.length);
          list.innerHTML = '';
          for (const task of inStatus) {
            const el = document.createElement('div');
            el.className = 'task';
            const dueClass = task.dueDate && new Date(task.dueDate).toISOString().slice(0,10) < new Date().toISOString().slice(0,10) ? 'due-overdue' : '';
            const priorityBadge = task.priority === 'medium' ? '' : '<span class="badge priority-' + task.priority + '">優先度:' + ({ low: '低', high: '高', critical: '最高' }[task.priority] ?? '') + '</span>';
            const tagBadges = (task.tags ?? []).map((tag, index) => '<span class="badge" style="background:' + ['#dbeafe','#dcfce7','#fef3c7','#fee2e2','#ede9fe'][index % 5] + '">' + tag + '</span>').join('');
            const due = task.dueDate ? '<span class="badge ' + dueClass + '">' + new Date(task.dueDate).toLocaleDateString('ja-JP') + '</span>' : '';
            const desc = task.description ? '<div class="task-desc">' + task.description + '</div>' : '';
            el.innerHTML = '<div class="task-header"><span class="task-seq">#' + (task.sequenceNumber ?? '') + '</span><button type="button" data-action="menu">...</button></div><div>' + task.title + '</div>' + desc + '<div class="task-meta">' + priorityBadge + tagBadges + due + '</div>';
            el.draggable = true;
            el.dataset.taskId = task.taskId;
            el.querySelector('button[data-action="menu"]').addEventListener('click', () => {
              const action = window.confirm('編集する場合はOK、削除はキャンセル') ? 'edit' : 'delete';
              vscode.postMessage({ type: 'card:menu', action, taskId: task.taskId });
            });
            el.addEventListener('dragstart', () => el.dataset.dragging = 'true');
            el.addEventListener('dragend', () => delete el.dataset.dragging);
            list.appendChild(el);
          }
        }
      };
      document.querySelectorAll('.add-task').forEach(button => {
        button.addEventListener('click', () => {
          const status = button.closest('.column')?.dataset.status;
          if (!status) return;
          vscode.postMessage({ type: 'card:create', status });
        });
      });

      document.querySelectorAll('.column').forEach(column => {
        column.addEventListener('dragover', (event) => event.preventDefault());
        column.addEventListener('drop', () => {
          const dragging = document.querySelector('.task[data-dragging="true"]');
          if (!dragging) return;
          const task = tasks.find(t => t.taskId === dragging.dataset.taskId);
          if (!task) return;
          const toStatus = column.dataset.status;
          if (task.status === toStatus) return;
          const { version, ...taskWithoutVersion } = task;
          const dropTask = { ...taskWithoutVersion, expectedVersion: version };
          vscode.postMessage({ type: 'board:drop', task: dropTask, toStatus });
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
  if (!(candidate.type === 'board:drop' && typeof candidate.toStatus === 'string' && typeof candidate.task === 'object' && candidate.task)) {
    return false;
  }
  const task = candidate.task as Record<string, unknown>;
  return typeof task.expectedVersion === 'number';
}

function isCardMenuMessage(value: unknown): value is { type: 'card:menu'; action: 'edit' | 'delete'; taskId: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'card:menu' && (candidate.action === 'edit' || candidate.action === 'delete') && typeof candidate.taskId === 'string';
}
