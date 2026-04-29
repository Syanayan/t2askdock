import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UiEventBus } from '../events/ui-event-bus.js';
import type * as vscode from 'vscode';

export class BoardWebviewPanel {
  public static readonly VIEW_TYPE = 'taskDock.boardView';

  public constructor(
    private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
    private readonly eventBus: UiEventBus
  ) {}

  public render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>): void {
    panel.title = 'Task Dock Board';
    panel.webview.html = this.buildHtml();
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
    </style>
  </head>
  <body>
    <h2>Task Board</h2>
    <p class="hint">ドラッグ&ドロップ連携は次のフェーズで拡張します。</p>
    <section class="board">
      <article class="column"><h3>Todo</h3></article>
      <article class="column"><h3>In Progress</h3></article>
      <article class="column"><h3>Review</h3></article>
      <article class="column"><h3>Done</h3></article>
    </section>
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
