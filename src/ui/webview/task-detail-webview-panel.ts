import type * as vscode from 'vscode';
import type { CommentRow } from '../../core/ports/repositories/comment-repository.js';
import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { TaskDetail } from '../../core/ports/repositories/task-repository.js';
import type { AddTaskCommentUseCase } from '../../core/usecase/comments/add-task-comment-usecase.js';
import type { CreateTaskUseCase } from '../../core/usecase/create-task-usecase.js';
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
    private readonly executeCommand: (cmd: string, args?: unknown) => Promise<unknown>,
    private readonly createTaskUseCase: Pick<CreateTaskUseCase, 'execute'>
  ) {}

  public async render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title' | 'dispose'>, taskId?: string, createProjectId?: string): Promise<void> {
    if (!taskId) {
      panel.title = 'Create Task';
      panel.webview.html = this.buildCreateHtml(createProjectId);
      this.messageListenerDisposable?.dispose();
      this.messageListenerDisposable = panel.webview.onDidReceiveMessage(async (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const m = message as Record<string, unknown>;
        if (m.type === 'detail:close') panel.dispose();
        if (m.type !== 'detail:create') return;
        const title = typeof m.title === 'string' ? m.title.trim() : '';
        const projectId = typeof m.projectId === 'string' ? m.projectId.trim() : '';
        if (!title || !projectId) return;
        await this.createTaskUseCase.execute({
          taskId: nextUlid(), projectId, title, description: typeof m.description === 'string' ? m.description : null,
          status: (typeof m.status === 'string' ? m.status : 'todo') as TaskStatus,
          priority: (typeof m.priority === 'string' ? m.priority : 'medium') as Priority,
          assignee: typeof m.assignee === 'string' ? (m.assignee.trim() || null) : null,
          dueDate: typeof m.dueDate === 'string' ? (m.dueDate.trim() || null) : null,
          tags: typeof m.tags === 'string' ? m.tags.split(',').map(v => v.trim()).filter(Boolean) : [],
          parentTaskId: null, actorId: ACTOR_ID, now: new Date().toISOString()
        });
        panel.dispose();
      });
      return;
    }
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
      if (m.type === 'detail:closeTask') {
        const reason = typeof m.reason === 'string' ? m.reason.trim() : '';
        if (!reason) {
          await panel.webview.postMessage({ type: 'detail:error', message: 'Close reason is required.' });
          return;
        }
        const current = await this.findDetailById(taskId); if (!current) return;
        await this.updateTaskUseCase.execute({ ...current, actorId: ACTOR_ID, expectedVersion: current.version, now: new Date().toISOString(), isClosed: true, closeReason: reason, isArchived: false, status: 'done' });
        panel.dispose();
      }
      if (m.type === 'detail:archiveTask') {
        const current = await this.findDetailById(taskId); if (!current) return;
        if (!(current.status === 'done' || current.isClosed)) {
          await panel.webview.postMessage({ type: 'detail:error', message: 'Only done/closed tasks can be archived.' });
          return;
        }
        await this.updateTaskUseCase.execute({ ...current, actorId: ACTOR_ID, expectedVersion: current.version, now: new Date().toISOString(), isArchived: true });
        panel.dispose();
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
          progress: typeof m.progress === 'number' ? m.progress : current.progress,
          isClosed: current.isClosed,
          isArchived: current.isArchived,
          closeReason: current.closeReason
        });
        await this.render(panel, taskId);
      }
      if (m.type === 'detail:comment:add' && typeof m.body === 'string' && m.body.trim()) {
        await this.addCommentUseCase.execute({ commentId: nextUlid(), taskId, body: m.body, actorId: ACTOR_ID, now: new Date().toISOString() });
        await panel.webview.postMessage({ type: 'detail:comments:refresh', comments: await this.listComments(taskId) });
      }
      if (m.type === 'detail:file:open' && typeof m.path === 'string') {
        await this.executeCommand('vscode.open', toVscodeOpenTarget(m.path));
      }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage({ type: 'detail:error', message: messageText });
      }
    });
  }
  private buildCreateHtml(projectId: string = 'default'): string {
    return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"/><style>
    body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);margin:0;padding:12px}
    .layout{display:flex;gap:12px;flex-wrap:wrap}.main{flex:7;min-width:0}.side{flex:3;min-width:240px}
    .panel{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);border-radius:8px;padding:12px;margin-bottom:12px}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.header-actions{margin-left:auto;display:flex;gap:8px;position:sticky;top:0}.btn{border:1px solid var(--vscode-panel-border);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:4px 10px;border-radius:6px;cursor:pointer}
    .btn.secondary{background:transparent;color:var(--vscode-editor-foreground)} .btn:disabled{opacity:.5;cursor:not-allowed}
    input,select,textarea{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:6px;box-sizing:border-box;width:100%}
    textarea{resize:vertical;min-height:84px}.field{display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:8px}
    </style></head><body class="editing"><div class="layout"><div class="main">
    <section class="panel"><div class="row"><h2 style="margin:0">Create Task</h2><span style="margin-left:auto"></span><button id="btn-save" class="btn" disabled>Save</button><button id="btn-close" class="btn secondary">Close</button></div></section>
    <section class="panel"><div class="field"><label>Title</label><input id="edit-title" placeholder="Task title (required)"/></div><div class="field"><label>Description</label><textarea id="edit-description" rows="6"></textarea></div></section>
    </div><aside class="side"><section class="panel"><h3>Properties</h3><div class="field"><label>Status</label><select id="edit-status"><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></div><div class="field"><label>Priority</label><select id="edit-priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div><div class="field"><label>Assignee</label><input id="edit-assignee"/></div><div class="field"><label>Due</label><input type="date" id="edit-dueDate"/></div><div class="field"><label>Tags</label><input id="edit-tags" placeholder="a,b,c"/></div></section></aside></div>
    <script>const vscode=acquireVsCodeApi();const projectId=${JSON.stringify(projectId)};const titleEl=document.getElementById('edit-title');const saveBtn=document.getElementById('btn-save');const canSave=()=>titleEl.value.trim().length>0;const sync=()=>{saveBtn.disabled=!canSave();};const post=()=>{if(!canSave())return;vscode.postMessage({type:'detail:create',projectId,title:titleEl.value.trim(),description:document.getElementById('edit-description').value,status:document.getElementById('edit-status').value,priority:document.getElementById('edit-priority').value,assignee:document.getElementById('edit-assignee').value,dueDate:document.getElementById('edit-dueDate').value,tags:document.getElementById('edit-tags').value});};titleEl.addEventListener('input',sync);sync();saveBtn.onclick=post;document.getElementById('btn-close').onclick=()=>vscode.postMessage({type:'detail:close'});document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();post();}});</script></body></html>`;
  }

  private buildHtml(detail: TaskDetail, subtasks: SubtaskItem[], comments: ReadonlyArray<CommentRow>): string {
    const safe = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const statusLabel = (s: string) => ({ todo: 'Todo', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done', close: 'Close', archived: '📦 Archived' }[s] ?? s);
    const priorityLabel = (p: string) => ({ low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }[p] ?? p);
    const displayStatus = detail.isArchived ? 'archived' : (detail.isClosed ? 'close' : detail.status);
    const propertiesStatus = detail.isClosed ? 'close' : detail.status;
    const commentRows: CommentRow[] = [...comments].sort((a: CommentRow, b: CommentRow) => a.createdAt.localeCompare(b.createdAt));
    return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"/><style>
    body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);margin:0;padding:12px}
    .layout,.detail-layout{display:flex;gap:12px;flex-wrap:wrap}.main,.detail-main{flex:7;min-width:0}.side,.detail-side{flex:3;min-width:240px}
    .panel{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);border-radius:8px;padding:12px;margin-bottom:12px}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.header-actions{margin-left:auto;display:flex;gap:8px;position:sticky;top:0}.btn{border:1px solid var(--vscode-panel-border);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:4px 10px;border-radius:6px;cursor:pointer}
    .btn.secondary{background:transparent;color:var(--vscode-editor-foreground)} .badge{font-size:11px;border-radius:999px;font-weight:600;padding:2px 8px}
    .status-todo{background:color-mix(in srgb,var(--vscode-charts-blue) 18%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-blue) 45%,var(--vscode-panel-border))} .status-in_progress{background:color-mix(in srgb,var(--vscode-charts-yellow) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-yellow) 45%,var(--vscode-panel-border))} .status-done{background:color-mix(in srgb,var(--vscode-charts-green) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-green) 45%,var(--vscode-panel-border))} .status-blocked{background:color-mix(in srgb,var(--vscode-charts-red) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-red) 45%,var(--vscode-panel-border))} .status-close{background:color-mix(in srgb,var(--vscode-charts-purple) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-purple) 45%,var(--vscode-panel-border))} .status-archived{background:linear-gradient(135deg,color-mix(in srgb,var(--vscode-charts-gray) 25%,transparent),color-mix(in srgb,var(--vscode-charts-blue) 20%,transparent));color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-blue) 55%,var(--vscode-panel-border));font-weight:800;letter-spacing:.2px;box-shadow:0 0 0 1px color-mix(in srgb,var(--vscode-charts-blue) 25%,transparent) inset}
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
      <section class="panel"><div id="error-banner" style="display:none;color:var(--vscode-errorForeground);margin-bottom:8px"></div><div class="row"><h2 style="margin:0" class="view-only">${safe(detail.title)}</h2><input class="edit-only" id="edit-title" value="${safe(detail.title)}" style="flex:1"/></div></section>
      <section class="panel view-only" id="close-reason-panel" style="display:none"><h3>Close Task</h3><div class="field"><label>Reason</label><input id="close-reason-input" placeholder="Reason (required)"/></div><div class="row"><button id="btn-close-confirm" class="btn">Confirm Close</button><button id="btn-close-reason-dismiss" class="btn secondary">Dismiss</button></div></section>
      <section class="panel"><h3>Description</h3><div class="view-only desc-view" id="desc-view">${safe(detail.description ?? '—')}</div><textarea class="edit-only" id="edit-description" rows="6">${safe(detail.description ?? '')}</textarea></section>
      <section class="panel" ${subtasks.length===0?'style="display:none"':''}><h3>Subtasks</h3>${subtasks.map(s=>`<label class="row"><input type="checkbox" data-subtask-id="${s.taskId}" ${s.status==='done'?'checked':''}/> ${safe(s.title)} <span class="badge status-${s.status}">${statusLabel(s.status)}</span><span class="badge priority-${s.priority}">${priorityLabel(s.priority)}</span></label>`).join('')}</section>
      <section class="panel"><h3>Comments / Activity</h3><div id="comments">${commentRows.map((c: CommentRow)=>`<div class="comment"><div class="vote">▲<span>•</span>▼</div><div><div class="meta"><span class="comment-author">${safe(c.createdBy)}</span><span class="comment-date">${new Date(c.createdAt).toLocaleString('ja-JP')}</span></div><div class="comment-body">${safe(c.body)}</div><div class="history">updated: ${new Date(c.updatedAt).toLocaleString('ja-JP')} ${c.deletedAt?`• deleted: ${new Date(c.deletedAt).toLocaleString('ja-JP')}`:''}</div></div></div>`).join('')}</div>
      <textarea id="comment-input" rows="3" placeholder="コメントを追加..." style="width:100%"></textarea><div class="row"><button id="btn-comment-close" class="btn secondary">close comment</button><button id="btn-comment-add" class="btn">comment</button></div></section>
    </div><aside class="side detail-side"><section class="panel"><h3>Actions</h3><div class="row"><button id="btn-edit" class="btn secondary view-only">Edit</button><button id="btn-save" class="btn edit-only">Save</button><button id="btn-close" class="btn secondary">Dismiss</button></div><div class="row" style="margin-top:8px"><button id="btn-close-task" class="btn secondary view-only">Close Task</button></div></section><section class="panel"><h3>Properties</h3>
      <div class="field"><label>Assignee</label><div class="view-only">${safe(detail.assignee ?? '—')}</div><input class="edit-only" id="edit-assignee" value="${safe(detail.assignee ?? '')}"/></div>
      <div class="field"><label>Due</label><div class="view-only">${safe(detail.dueDate ?? '—')}</div><input class="edit-only" type="date" id="edit-dueDate" value="${safe(detail.dueDate ?? '')}"/></div>
      <div class="field"><label>Status</label><div class="view-only"><span class="badge status-${propertiesStatus}">${statusLabel(propertiesStatus)}</span></div><select class="edit-only" id="edit-status"><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></div>
      <div class="field"><label>Priority</label><div class="view-only"><span class="badge priority-${detail.priority}">${priorityLabel(detail.priority)}</span></div><select class="edit-only" id="edit-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
      <div class="field"><label>Progress</label><div class="view-only">${detail.progress}%</div><input class="edit-only" id="edit-progress" type="range" min="0" max="100" value="${detail.progress}"/></div>
      <div class="field"><label>Tags</label><div class="view-only">${safe(detail.tags.join(', ')||'—')}</div><input class="edit-only" id="edit-tags" value="${safe(detail.tags.join(', '))}"/></div>
    </section></aside></div>
    <script>const vscode=acquireVsCodeApi();const orig=${JSON.stringify(detail)};
      document.getElementById('btn-close').onclick=()=>{if(document.body.classList.contains('editing')){document.body.classList.remove('editing');return;}vscode.postMessage({type:'detail:close'});};
      document.getElementById('btn-close-task').onclick=()=>{document.getElementById('close-reason-panel').style.display='block';document.getElementById('close-reason-input').focus();};
      document.getElementById('btn-comment-close').onclick=()=>{document.getElementById('close-reason-panel').style.display='block';document.getElementById('close-reason-input').focus();};
      document.getElementById('btn-close-confirm').onclick=()=>{const reason=document.getElementById('close-reason-input').value.trim();if(!reason){const b=document.getElementById('error-banner');b.textContent='Close reason is required.';b.style.display='block';return;}vscode.postMessage({type:'detail:closeTask',reason});};
      document.getElementById('btn-close-reason-dismiss').onclick=()=>{document.getElementById('close-reason-panel').style.display='none';};
      document.getElementById('btn-edit').onclick=()=>{document.body.classList.add('editing');document.getElementById('edit-status').value=orig.status;document.getElementById('edit-priority').value=orig.priority;};
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

function toVscodeOpenTarget(pathOrUri: string): { fsPath: string } | { scheme: string; path: string; fsPath: string; toString: () => string } {
  if (pathOrUri.startsWith('file://')) {
    const uri = new URL(pathOrUri);
    return {
      scheme: 'file',
      path: decodeURIComponent(uri.pathname),
      fsPath: decodeURIComponent(uri.pathname),
      toString: () => pathOrUri
    };
  }
  return { fsPath: pathOrUri };
}
