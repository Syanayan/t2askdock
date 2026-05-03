import type * as vscode from 'vscode';
import type { CommentRow } from '../../core/ports/repositories/comment-repository.js';
import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { TaskDetail } from '../../core/ports/repositories/task-repository.js';
import type { AddTaskCommentUseCase } from '../../core/usecase/comments/add-task-comment-usecase.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UpdateTaskUseCase } from '../../core/usecase/update-task-usecase.js';

type SubtaskItem = { taskId: string; title: string; status: TaskStatus; priority: Priority; hasChildren: boolean };

const ACTOR_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

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
    const [subtasks, comments] = await Promise.all([this.listSubtasks(taskId), this.listComments(taskId)]);
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
        await this.moveTaskStatusUseCase.execute({ ...subDetail, actorId: ACTOR_ID, toStatus: m.newStatus as TaskStatus, expectedVersion: subDetail.version, now: new Date().toISOString() });
      }
      if (m.type === 'detail:save') {
        const current = await this.findDetailById(taskId);
        if (!current) return;
        await this.updateTaskUseCase.execute({ ...current, actorId: ACTOR_ID, expectedVersion: current.version, now: new Date().toISOString(),
          title: typeof m.title === 'string' ? m.title : current.title,
          description: typeof m.description === 'string' ? m.description : current.description,
          status: typeof m.status === 'string' ? (m.status as TaskStatus) : current.status,
          priority: typeof m.priority === 'string' ? (m.priority as Priority) : current.priority,
          assignee: typeof m.assignee === 'string' ? m.assignee : current.assignee,
          dueDate: typeof m.dueDate === 'string' ? m.dueDate : current.dueDate,
          tags: Array.isArray(m.tags) ? m.tags.filter((v): v is string => typeof v === 'string') : current.tags,
          progress: typeof m.progress === 'number' ? m.progress : current.progress });
        await this.render(panel, taskId);
      }
      if (m.type === 'detail:comment:add' && typeof m.body === 'string' && m.body.trim()) {
        await this.addCommentUseCase.execute({ commentId: crypto.randomUUID(), taskId, body: m.body, actorId: ACTOR_ID, now: new Date().toISOString() });
        const refreshed = await this.listComments(taskId);
        await panel.webview.postMessage({ type: 'detail:comments:refresh', comments: refreshed });
      }
      if (m.type === 'detail:file:open' && typeof m.path === 'string') {
        await this.executeCommand('vscode.open', { fsPath: m.path });
      }
    });
  }

  private buildHtml(detail: TaskDetail, subtasks: SubtaskItem[], comments: ReadonlyArray<CommentRow>): string {
    const doneCount = subtasks.filter(s => s.status === 'done').length;
    const commentItems = comments.filter(c => !c.deletedAt);
    const safe = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>
      body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);margin:0;padding:12px}
      .detail-layout{display:flex;gap:16px;flex-wrap:wrap}.detail-main{flex:7;min-width:0}.detail-side{flex:3;min-width:220px}
      .card{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);border-radius:8px;padding:12px;margin-bottom:12px}
      .badges{display:flex;gap:8px;align-items:center}.badge{padding:2px 8px;border-radius:999px;border:1px solid var(--vscode-panel-border)}
      .subtask-item,.comment-item{padding:6px 0;border-bottom:1px solid var(--vscode-panel-border)}
      .actions{display:flex;gap:8px}.muted{opacity:.8}.title{margin-top:0}
    </style></head><body>
      <div class="detail-layout">
        <div class="detail-main">
          <section class="card"><h2 class="title">${safe(detail.title)}</h2>
            <div class="badges"><span class="badge">${detail.status}</span><span class="badge">${detail.priority}</span><span class="muted">Progress: ${detail.progress}%</span></div>
          </section>
          <section class="card"><h3>Description</h3><div id="description-view">${safe(detail.description ?? '(説明なし)')}</div></section>
          <section class="card" ${subtasks.length === 0 ? 'style="display:none"' : ''}><h3>サブタスク (${doneCount}/${subtasks.length})</h3>
            <div>${subtasks.map(s => `<label class="subtask-item"><input type="checkbox" data-subtask-id="${s.taskId}" ${s.status === 'done' ? 'checked' : ''}/> ${safe(s.title)} <span class="badge">${s.status}</span></label>`).join('')}</div>
          </section>
          <section class="card"><h3>コメント</h3><div id="comments-list">${commentItems.map(c => `<div class="comment-item"><div class="muted">${safe(c.createdBy)} / ${new Date(c.createdAt).toLocaleString('ja-JP')}</div><div>${safe(c.body)}</div></div>`).join('')}</div>
            <textarea id="comment-input" rows="3" style="width:100%"></textarea><div class="actions"><button id="btn-comment-add">送信</button></div>
          </section>
        </div>
        <aside class="detail-side">
          <section class="card"><h3>Properties</h3>
            <div>Assignee: ${safe(detail.assignee ?? '—')}</div><div>Due: ${safe(detail.dueDate ?? '—')}</div><div>Tags: ${safe(detail.tags.join(', ') || '—')}</div>
          </section>
          <section class="card"><div class="actions"><button id="btn-close">閉じる</button></div></section>
        </aside>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('btn-close').addEventListener('click',()=>vscode.postMessage({type:'detail:close'}));
        document.querySelectorAll('[data-subtask-id]').forEach(el=>el.addEventListener('change',(e)=>{const t=e.target; vscode.postMessage({type:'detail:subtask:toggle',taskId:t.dataset.subtaskId,newStatus:t.checked?'done':'todo'});}));
        document.getElementById('btn-comment-add').addEventListener('click',()=>{const el=document.getElementById('comment-input'); const body=el.value.trim(); if(!body) return; vscode.postMessage({type:'detail:comment:add',body}); el.value='';});
        window.addEventListener('message',(event)=>{if(event.data?.type!=='detail:comments:refresh') return; const list=(event.data.comments||[]).filter(c=>!c.deletedAt); const safe=(v)=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); document.getElementById('comments-list').innerHTML=list.map(c=>'<div class="comment-item"><div class="muted">'+safe(c.createdBy)+' / '+new Date(c.createdAt).toLocaleString('ja-JP')+'</div><div>'+safe(c.body)+'</div></div>').join('');});
      </script>
    </body></html>`;
  }
}
