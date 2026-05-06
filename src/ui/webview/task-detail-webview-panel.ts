import type * as vscode from 'vscode';
import type { CommentRow } from '../../core/ports/repositories/comment-repository.js';
import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { TaskDetail } from '../../core/ports/repositories/task-repository.js';
import type { AddTaskCommentUseCase } from '../../core/usecase/comments/add-task-comment-usecase.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UpdateTaskUseCase } from '../../core/usecase/update-task-usecase.js';

type SubtaskItem = { taskId: string; title: string; status: TaskStatus; priority: Priority; hasChildren: boolean };
const ACTOR_ID = 'system';
const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const nextUlid = (): string => Array.from({ length: 26 }, () => ULID_CHARS[Math.floor(Math.random() * ULID_CHARS.length)]).join('');

export class TaskDetailWebviewPanel {
  private messageListenerDisposable: vscode.Disposable | undefined;
  public constructor(
    private readonly findDetailById: (taskId: string) => Promise<TaskDetail | null>,
    private readonly listSubtasks: (parentTaskId: string) => Promise<SubtaskItem[]>,
    private readonly listComments: (taskId: string) => Promise<ReadonlyArray<CommentRow>>,
    private readonly updateTaskUseCase: Pick<UpdateTaskUseCase, 'execute'>,
    private readonly moveTaskStatusUseCase: Pick<MoveTaskStatusUseCase, 'execute'>,
    private readonly addCommentUseCase: Pick<AddTaskCommentUseCase, 'execute'>,
    private readonly executeCommand: (cmd: string, args?: unknown) => Promise<unknown>
  ) {}

  public async render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title' | 'dispose'>, taskId: string): Promise<void> {
    const detail = await this.findDetailById(taskId); if (!detail) return;
    const [subtasks, comments] = await Promise.all([this.listSubtasks(taskId), this.listComments(taskId)]);
    panel.title = `Task: ${detail.title}`;
    panel.webview.html = this.buildHtml(detail, subtasks, comments);
    this.messageListenerDisposable?.dispose();
    this.messageListenerDisposable = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      try {
      if (!message || typeof message !== 'object') return;
      const m = message as Record<string, unknown>;
      if (m.type === 'detail:close') panel.dispose();
      if (m.type === 'detail:subtask:toggle' && typeof m.taskId === 'string' && typeof m.newStatus === 'string') {
        const subDetail = await this.findDetailById(m.taskId); if (!subDetail) return;
        await this.moveTaskStatusUseCase.execute({ ...subDetail, actorId: ACTOR_ID, toStatus: m.newStatus as TaskStatus, expectedVersion: subDetail.version, now: new Date().toISOString() });
      }
      if (m.type === 'detail:save') {
        const current = await this.findDetailById(taskId); if (!current) return;
        await this.updateTaskUseCase.execute({ ...current, actorId: ACTOR_ID, expectedVersion: current.version, now: new Date().toISOString(),
          title: typeof m.title === 'string' ? m.title : current.title,
          description: typeof m.description === 'string' ? m.description : current.description,
          status: typeof m.status === 'string' ? (m.status as TaskStatus) : current.status,
          priority: typeof m.priority === 'string' ? (m.priority as Priority) : current.priority,
          assignee: typeof m.assignee === 'string' ? (m.assignee.trim() || null) : current.assignee,
          dueDate: typeof m.dueDate === 'string' ? (m.dueDate.trim() || null) : current.dueDate,
          tags: typeof m.tags === 'string' ? m.tags.split(',').map(v => v.trim()).filter(Boolean) : current.tags,
          progress: typeof m.progress === 'number' ? m.progress : current.progress
        });
        await this.render(panel, taskId);
      }
      if (m.type === 'detail:comment:add' && typeof m.body === 'string' && m.body.trim()) {
        await this.addCommentUseCase.execute({ commentId: nextUlid(), taskId, body: m.body, actorId: ACTOR_ID, now: new Date().toISOString() });
        await panel.webview.postMessage({ type: 'detail:comments:refresh', comments: await this.listComments(taskId) });
      }
      if (m.type === 'detail:file:open' && typeof m.path === 'string') await this.executeCommand('vscode.open', { fsPath: m.path });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage({ type: 'detail:error', message: messageText });
      }
    });
  }

  private buildHtml(detail: TaskDetail, subtasks: SubtaskItem[], comments: ReadonlyArray<CommentRow>): string {
    const safe = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const statusLabel = (s: string) => ({ todo: 'Todo', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done' }[s] ?? s);
    const priorityLabel = (p: string) => ({ low: '低', medium: '中', high: '高', critical: '最高' }[p] ?? p);
    const commentRows: CommentRow[] = [...comments].sort((a: CommentRow, b: CommentRow) => a.createdAt.localeCompare(b.createdAt));
    return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"/><style>
    body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);margin:0;padding:12px}
    .layout,.detail-layout{display:flex;gap:12px;flex-wrap:wrap}.main,.detail-main{flex:7;min-width:0}.side,.detail-side{flex:3;min-width:240px}
    .panel{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);border-radius:8px;padding:12px;margin-bottom:12px}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.btn{border:1px solid var(--vscode-panel-border);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:4px 10px;border-radius:6px;cursor:pointer}
    .btn.secondary{background:transparent;color:var(--vscode-editor-foreground)} .badge{font-size:11px;border-radius:999px;font-weight:600;padding:2px 8px}
    .status-todo{background:color-mix(in srgb,var(--vscode-charts-blue) 18%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-blue) 45%,var(--vscode-panel-border))} .status-in_progress{background:color-mix(in srgb,var(--vscode-charts-yellow) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-yellow) 45%,var(--vscode-panel-border))} .status-done{background:color-mix(in srgb,var(--vscode-charts-green) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-green) 45%,var(--vscode-panel-border))} .status-blocked{background:color-mix(in srgb,var(--vscode-charts-red) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-red) 45%,var(--vscode-panel-border))}
    .priority-low{background:#f0f0f0;color:#666} .priority-medium{background:color-mix(in srgb,var(--vscode-charts-yellow) 15%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-yellow) 35%,var(--vscode-panel-border))} .priority-high{background:#ffedd5;color:#9a3412} .priority-critical{background:#fee2e2;color:#991b1b}
    body.editing .view-only{display:none} body:not(.editing) .edit-only{display:none}
    .field{display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:8px}
    input,select,textarea{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:6px;box-sizing:border-box;width:100%} textarea{resize:vertical;min-height:84px}
    .comment{display:grid;grid-template-columns:32px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--vscode-panel-border)}
    .vote{display:flex;flex-direction:column;align-items:center;opacity:.7;font-size:11px}.meta{opacity:.8;font-size:12px}
    .history{font-size:11px;opacity:.7;margin-top:4px}
    .comment-author{font-weight:600;color:var(--vscode-editor-foreground)}.comment-date{opacity:.6;font-size:11px;margin-left:6px}.comment-body{white-space:pre-wrap;word-break:break-word;margin:4px 0}
    .desc-view{white-space:pre-wrap;word-break:break-word}
    </style></head><body>
    <div class="layout detail-layout"><div class="main detail-main">
      <section class="panel"><div id="error-banner" style="display:none;color:var(--vscode-errorForeground);margin-bottom:8px"></div><div class="row"><h2 style="margin:0" class="view-only">${safe(detail.title)}</h2><input class="edit-only" id="edit-title" value="${safe(detail.title)}" style="flex:1"/>
      <span class="badge status-${detail.status}">${statusLabel(detail.status)}</span><span class="badge priority-${detail.priority}">${priorityLabel(detail.priority)}</span><span>Progress ${detail.progress}%</span>
      <span style="margin-left:auto"></span><button id="btn-edit" class="btn secondary view-only">Edit</button><button id="btn-save" class="btn edit-only">Save</button><button id="btn-cancel" class="btn secondary edit-only">Cancel</button><button id="btn-close" class="btn secondary">Close</button></div></section>
      <section class="panel"><h3>Description</h3><div class="view-only desc-view" id="desc-view">${safe(detail.description ?? '—')}</div><textarea class="edit-only" id="edit-description" rows="6">${safe(detail.description ?? '')}</textarea></section>
      <section class="panel" ${subtasks.length===0?'style="display:none"':''}><h3>Subtasks</h3>${subtasks.map(s=>`<label class="row"><input type="checkbox" data-subtask-id="${s.taskId}" ${s.status==='done'?'checked':''}/> ${safe(s.title)} <span class="badge status-${s.status}">${statusLabel(s.status)}</span><span class="badge priority-${s.priority}">${priorityLabel(s.priority)}</span></label>`).join('')}</section>
      <section class="panel"><h3>Comments / Activity</h3><div id="comments">${commentRows.map((c: CommentRow)=>`<div class="comment"><div class="vote">▲<span>•</span>▼</div><div><div class="meta"><span class="comment-author">${safe(c.createdBy)}</span><span class="comment-date">${new Date(c.createdAt).toLocaleString('ja-JP')}</span></div><div class="comment-body">${safe(c.body)}</div><div class="history">updated: ${new Date(c.updatedAt).toLocaleString('ja-JP')} ${c.deletedAt?`• deleted: ${new Date(c.deletedAt).toLocaleString('ja-JP')}`:''}</div></div></div>`).join('')}</div>
      <textarea id="comment-input" rows="3" placeholder="コメントを追加..." style="width:100%"></textarea><div class="row"><button id="btn-comment-add" class="btn">送信</button></div></section>
    </div><aside class="side detail-side"><section class="panel"><h3>Properties</h3>
      <div class="field"><label>Assignee</label><div class="view-only">${safe(detail.assignee ?? '—')}</div><input class="edit-only" id="edit-assignee" value="${safe(detail.assignee ?? '')}"/></div>
      <div class="field"><label>Due</label><div class="view-only">${safe(detail.dueDate ?? '—')}</div><input class="edit-only" type="date" id="edit-dueDate" value="${safe(detail.dueDate ?? '')}"/></div>
      <div class="field"><label>Status</label><div class="view-only"><span class="badge status-${detail.status}">${statusLabel(detail.status)}</span></div><select class="edit-only" id="edit-status"><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></div>
      <div class="field"><label>Priority</label><div class="view-only"><span class="badge priority-${detail.priority}">${priorityLabel(detail.priority)}</span></div><select class="edit-only" id="edit-priority"><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="critical">最高</option></select></div>
      <div class="field"><label>Progress</label><div class="view-only">${detail.progress}%</div><input class="edit-only" id="edit-progress" type="range" min="0" max="100" value="${detail.progress}"/></div>
      <div class="field"><label>Tags</label><div class="view-only">${safe(detail.tags.join(', ')||'—')}</div><input class="edit-only" id="edit-tags" value="${safe(detail.tags.join(', '))}"/></div>
    </section></aside></div>
    <script>const vscode=acquireVsCodeApi();const orig=${JSON.stringify(detail)};
      document.getElementById('btn-close').onclick=()=>vscode.postMessage({type:'detail:close'});
      document.getElementById('btn-edit').onclick=()=>{document.body.classList.add('editing');document.getElementById('edit-status').value=orig.status;document.getElementById('edit-priority').value=orig.priority;};
      document.getElementById('btn-cancel').onclick=()=>{document.body.classList.remove('editing');};
      document.getElementById('btn-save').onclick=()=>{vscode.postMessage({type:'detail:save',title:document.getElementById('edit-title').value,description:document.getElementById('edit-description').value,status:document.getElementById('edit-status').value,priority:document.getElementById('edit-priority').value,assignee:document.getElementById('edit-assignee').value,dueDate:document.getElementById('edit-dueDate').value,tags:document.getElementById('edit-tags').value,progress:Number(document.getElementById('edit-progress').value)});};
      document.querySelectorAll('[data-subtask-id]').forEach(el=>el.onchange=(e)=>{const t=e.target;vscode.postMessage({type:'detail:subtask:toggle',taskId:t.dataset.subtaskId,newStatus:t.checked?'done':'todo'});});
      document.getElementById('btn-comment-add').onclick=()=>{const el=document.getElementById('comment-input');const body=el.value.trim();if(!body)return;vscode.postMessage({type:'detail:comment:add',body});el.value='';};
      document.getElementById('comment-input').addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();document.getElementById('btn-comment-add').click();}});
      document.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&document.body.classList.contains('editing')&&document.activeElement!==document.getElementById('comment-input')){e.preventDefault();document.getElementById('btn-save').click();}});
      const esc=(s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const renderComments=(cs)=>[...cs].filter(c=>!c.deletedAt).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(c=>'<div class="comment"><div class="vote">▲<span>•</span>▼</div><div><div class="meta"><span class="comment-author">'+esc(c.createdBy)+'</span><span class="comment-date">'+new Date(c.createdAt).toLocaleString('ja-JP')+'</span></div><div class="comment-body">'+esc(c.body)+'</div><div class="history">updated: '+new Date(c.updatedAt).toLocaleString('ja-JP')+(c.deletedAt?' • deleted: '+new Date(c.deletedAt).toLocaleString('ja-JP'):'')+' </div></div></div>').join('');
      window.addEventListener('message',(event)=>{if(event.data?.type==='detail:comments:refresh'){document.getElementById('comments').innerHTML=renderComments(event.data.comments??[]);return;} if(event.data?.type==='detail:error'){const b=document.getElementById('error-banner');b.textContent=event.data.message||'error';b.style.display='block';}});
    </script></body></html>`;
  }
}
