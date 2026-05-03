import type * as vscode from 'vscode';
import type { CommentRow } from '../../core/ports/repositories/comment-repository.js';
import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { TaskDetail } from '../../core/ports/repositories/task-repository.js';
import type { AddTaskCommentUseCase } from '../../core/usecase/comments/add-task-comment-usecase.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UpdateTaskUseCase } from '../../core/usecase/update-task-usecase.js';

type SubtaskItem = { taskId: string; title: string; status: TaskStatus; priority: Priority; hasChildren: boolean };

export class TaskDetailWebviewPanel {
  private messageListenerDisposable: vscode.Disposable | undefined;

  public constructor(
    private readonly findDetailById: (taskId: string) => Promise<TaskDetail | null>,
    private readonly listSubtasks: (parentTaskId: string) => Promise<SubtaskItem[]>,
    private readonly listComments: (taskId: string) => Promise<ReadonlyArray<CommentRow>>,
    private readonly updateTaskUseCase: UpdateTaskUseCase,
    private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
    private readonly addCommentUseCase: AddTaskCommentUseCase,
    private readonly executeCommand: (cmd: string, args?: unknown) => Promise<unknown>
  ) {}

  public async render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title' | 'dispose'>, taskId: string): Promise<void> {
    const detail = await this.findDetailById(taskId);
    if (!detail) return;
    const subtasks = await this.listSubtasks(taskId);
    const comments = await this.listComments(taskId);
    panel.title = `Task: ${detail.title}`;
    panel.webview.html = this.buildHtml(detail, subtasks, comments);

    this.messageListenerDisposable?.dispose();
    this.messageListenerDisposable = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const m = message as Record<string, unknown>;
      if (m.type === 'detail:close') panel.dispose();
      if (m.type === 'detail:subtask:toggle' && typeof m.taskId === 'string' && typeof m.newStatus === 'string') {
        const subDetail = await this.findDetailById(m.taskId);
        if (!subDetail) return;
        await this.moveTaskStatusUseCase.execute({ ...subDetail, actorId: 'system', toStatus: m.newStatus as TaskStatus, expectedVersion: subDetail.version, now: new Date().toISOString() });
      }
      if (m.type === 'detail:save') {
        const current = await this.findDetailById(taskId);
        if (!current) return;
        await this.updateTaskUseCase.execute({
          ...current,
          actorId: 'system',
          expectedVersion: current.version,
          now: new Date().toISOString(),
          title: typeof m.title === 'string' ? m.title : current.title,
          description: typeof m.description === 'string' ? m.description : current.description,
          status: typeof m.status === 'string' ? (m.status as TaskStatus) : current.status,
          priority: typeof m.priority === 'string' ? (m.priority as Priority) : current.priority,
          assignee: typeof m.assignee === 'string' ? m.assignee : current.assignee,
          dueDate: typeof m.dueDate === 'string' ? m.dueDate : current.dueDate,
          tags: typeof m.tags === 'string' ? m.tags.split(',').map(v => v.trim()).filter(Boolean) : current.tags,
          progress: typeof m.progress === 'number' ? m.progress : current.progress
        });
        await this.render(panel, taskId);
      }
      if (m.type === 'detail:comment:add' && typeof m.body === 'string' && m.body.trim()) {
        await this.addCommentUseCase.execute({ commentId: crypto.randomUUID(), taskId, body: m.body, createdBy: 'system' });
        const refreshed = await this.listComments(taskId);
        await panel.webview.postMessage({ type: 'detail:comments:refresh', comments: refreshed });
      }
      if (m.type === 'detail:file:open' && typeof m.path === 'string') {
        await this.executeCommand('vscode.open', { fsPath: m.path });
      }
    });
  }

  private buildHtml(detail: TaskDetail, subtasks: SubtaskItem[], comments: ReadonlyArray<CommentRow>): string { return `<html><style>
    body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}
    .detail-layout{display:flex;gap:16px;flex-wrap:wrap}.detail-main{flex:7;min-width:0}.detail-side{flex:3;min-width:200px}
    body.editing .view-only{display:none} body:not(.editing) .edit-only{display:none}
  </style><body><div class="detail-layout"><div class="detail-main"><h1>${detail.title}</h1><section class="subtasks-section">${subtasks.map(s=>`<div data-task-id="${s.taskId}">${s.title}</div>`).join('')}</section><section class="comments-section">${comments.filter(c=>!c.deletedAt).map(c=>`<p>${c.body}</p>`).join('')}</section></div><aside class="detail-side"></aside></div>
  <button id="btn-close">x</button><script>const vscode=acquireVsCodeApi();document.getElementById('btn-close').onclick=()=>vscode.postMessage({type:'detail:close'});</script></body></html>`; }
}
