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
      if (m.type === 'detail:closeWithComment') {
        const reason = typeof m.reason === 'string' ? m.reason.trim() : '';
        if (!reason) {
          await panel.webview.postMessage({ type: 'detail:error', message: 'Close reason is required.' });
          return;
        }
        const current = await this.findDetailById(taskId); if (!current) return;
        const now = new Date().toISOString();
        await this.updateTaskUseCase.execute({ ...current, actorId: ACTOR_ID, expectedVersion: current.version, now, isClosed: true, closeReason: reason, isArchived: false, status: 'done' });
        await this.addCommentUseCase.execute({ commentId: nextUlid(), taskId, body: `🔒 Closed: ${reason}`, actorId: ACTOR_ID, now });
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
    *{box-sizing:border-box}
    body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);margin:0;padding:0}
    .sticky-header{position:sticky;top:0;z-index:100;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:8px}
    .header-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden}
    .header-left h2{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex-shrink:0}
    .header-left input{flex:1;min-width:0}
    .header-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
    .content{padding:12px 16px;max-width:820px}
    .panel{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);border-radius:8px;padding:14px;margin-bottom:12px}
    .section-label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:10px}
    .btn{border:1px solid var(--vscode-panel-border);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px}
    .btn.secondary{background:transparent;color:var(--vscode-editor-foreground)}
    .btn-x{background:transparent;border:none;color:var(--vscode-editor-foreground);font-size:20px;line-height:1;cursor:pointer;padding:0 4px;opacity:.6}
    .btn-x:hover{opacity:1}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    input,select,textarea{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:6px;width:100%}
    textarea{resize:vertical;min-height:80px}
    .field{display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:8px}
    .props-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-bottom:14px}
    .prop-cell{display:flex;flex-direction:column;gap:4px}
    .prop-head{display:flex;align-items:center;gap:5px}
    .prop-icon{font-size:13px}
    .prop-label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.5}
    #error-banner{color:var(--vscode-errorForeground);padding:8px 12px;background:color-mix(in srgb,var(--vscode-errorForeground) 10%,transparent);border-radius:6px;margin-bottom:10px;display:none}
    </style></head><body>
    <div class="sticky-header">
      <div class="header-left">
        <h2>Create Task</h2>
        <input id="edit-title" placeholder="Task title (required)"/>
      </div>
      <div class="header-right">
        <button id="btn-save" class="btn" disabled>Save</button>
        <button id="btn-close-x" class="btn-x" title="Close">×</button>
      </div>
    </div>
    <div class="content">
      <div id="error-banner"></div>
      <section class="panel">
        <div class="section-label">✏ Description</div>
        <textarea id="edit-description" rows="6"></textarea>
      </section>
      <section class="panel">
        <div class="section-label">Task Properties</div>
        <div class="props-grid">
          <div class="prop-cell">
            <div class="prop-head"><span class="prop-icon">👤</span><span class="prop-label">Assignee</span></div>
            <input id="edit-assignee"/>
          </div>
          <div class="prop-cell">
            <div class="prop-head"><span class="prop-icon">📅</span><span class="prop-label">Due Date</span></div>
            <input type="date" id="edit-dueDate"/>
          </div>
          <div class="prop-cell" style="grid-column:1/-1">
            <div class="prop-head"><span class="prop-icon">🏷</span><span class="prop-label">Tags</span></div>
            <input id="edit-tags" placeholder="a,b,c"/>
          </div>
        </div>
        <div class="field"><label>Status</label><select id="edit-status"><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="review">Review</option><option value="done">Done</option></select></div>
        <div class="field"><label>Priority</label><select id="edit-priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
      </section>
    </div>
    <script>const vscode=acquireVsCodeApi();const projectId=${JSON.stringify(projectId)};const titleEl=document.getElementById('edit-title');const saveBtn=document.getElementById('btn-save');const canSave=()=>titleEl.value.trim().length>0;const sync=()=>{saveBtn.disabled=!canSave();};const post=()=>{if(!canSave())return;vscode.postMessage({type:'detail:create',projectId,title:titleEl.value.trim(),description:document.getElementById('edit-description').value,status:document.getElementById('edit-status').value,priority:document.getElementById('edit-priority').value,assignee:document.getElementById('edit-assignee').value,dueDate:document.getElementById('edit-dueDate').value,tags:document.getElementById('edit-tags').value});};titleEl.addEventListener('input',sync);sync();saveBtn.onclick=post;document.getElementById('btn-close-x').onclick=()=>vscode.postMessage({type:'detail:close'});document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();post();}});
    window.addEventListener('message',(event)=>{if(event.data?.type==='detail:error'){const b=document.getElementById('error-banner');b.textContent=event.data.message||'error';b.style.display='block';}});
    </script></body></html>`;
  }

  private buildHtml(detail: TaskDetail, subtasks: SubtaskItem[], comments: ReadonlyArray<CommentRow>): string {
    const safe = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const statusLabel = (s: string) => ({ todo: 'Todo', in_progress: 'In Progress', review: 'Review', done: 'Done', close: 'Close', archived: '📦 Archived' }[s] ?? s);
    const priorityLabel = (p: string) => ({ low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }[p] ?? p);
    const displayStatus = detail.isArchived ? 'archived' : (detail.isClosed ? 'close' : detail.status);
    const commentRows: CommentRow[] = [...comments].filter((c: CommentRow) => !c.deletedAt).sort((a: CommentRow, b: CommentRow) => a.createdAt.localeCompare(b.createdAt));
    const tagChips = detail.tags.length > 0 ? detail.tags.map(t => `<span class="tag-chip">${safe(t)}</span>`).join('') : '<span style="opacity:.5">—</span>';
    const avatarHtml = (author: string) => {
      const isSystem = author === 'system';
      const initials = isSystem ? '⚙' : author.trim().split(/\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
      const hue = [...author].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 360;
      const bg = isSystem ? '#888' : `hsl(${hue},60%,55%)`;
      return `<div class="avatar" style="background:${bg}">${initials}</div>`;
    };
    const commentHtml = (c: CommentRow) => {
      const isSystem = c.createdBy === 'system';
      const bodyStyle = isSystem ? ' style="font-style:italic;opacity:.65"' : '';
      return `<div class="comment">${avatarHtml(c.createdBy)}<div><div class="comment-meta"><span class="comment-author">${safe(c.createdBy)}</span><span class="comment-date" data-ts="${safe(c.createdAt)}"></span></div><div class="comment-body"${bodyStyle}>${safe(c.body)}</div></div></div>`;
    };
    return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box}
    body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);margin:0;padding:0}
    .sticky-header{position:sticky;top:0;z-index:100;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:8px}
    .header-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden}
    .header-left h2{margin:0;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0}
    .header-left input{flex:1;min-width:0}
    .header-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
    .content{padding:12px 16px;max-width:820px}
    .panel{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);border-radius:8px;padding:14px;margin-bottom:12px}
    .section-label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:10px}
    .btn{border:1px solid var(--vscode-panel-border);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px}
    .btn.secondary{background:transparent;color:var(--vscode-editor-foreground)}
    .btn-x{background:transparent;border:none;color:var(--vscode-editor-foreground);font-size:20px;line-height:1;cursor:pointer;padding:0 4px;opacity:.6}
    .btn-x:hover{opacity:1}
    .badge{font-size:11px;border-radius:999px;font-weight:600;padding:2px 9px;white-space:nowrap;flex-shrink:0}
    .status-todo{background:color-mix(in srgb,var(--vscode-charts-blue) 18%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-blue) 45%,var(--vscode-panel-border))}
    .status-in_progress{background:color-mix(in srgb,var(--vscode-charts-yellow) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-yellow) 45%,var(--vscode-panel-border))}
    .status-done{background:color-mix(in srgb,var(--vscode-charts-green) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-green) 45%,var(--vscode-panel-border))}
    .status-review{background:color-mix(in srgb,var(--vscode-charts-purple) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-purple) 45%,var(--vscode-panel-border))}
    .status-close{background:color-mix(in srgb,var(--vscode-charts-purple) 20%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-purple) 45%,var(--vscode-panel-border))}
    .status-archived{background:linear-gradient(135deg,color-mix(in srgb,var(--vscode-charts-gray) 25%,transparent),color-mix(in srgb,var(--vscode-charts-blue) 20%,transparent));color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-blue) 55%,var(--vscode-panel-border));font-weight:800;letter-spacing:.2px}
    .priority-low{background:#f0f0f0;color:#666;border:1px solid #ddd}
    .priority-medium{background:color-mix(in srgb,var(--vscode-charts-yellow) 15%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-yellow) 35%,var(--vscode-panel-border))}
    .priority-high{background:#ffedd5;color:#9a3412;border:1px solid #fed7aa}
    .priority-critical{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
    body.editing .view-only{display:none!important} body:not(.editing) .edit-only{display:none!important}
    input,select,textarea{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:6px;width:100%}
    textarea{resize:vertical;min-height:80px}
    .field{display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:8px}
    .desc-view{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6}
    .props-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-bottom:14px}
    .prop-cell{display:flex;flex-direction:column;gap:4px}
    .prop-head{display:flex;align-items:center;gap:5px}
    .prop-icon{font-size:13px}
    .prop-label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.5}
    .prop-value{font-size:13px;word-break:break-word}
    .tag-chip{display:inline-block;background:color-mix(in srgb,var(--vscode-charts-blue) 15%,transparent);border:1px solid color-mix(in srgb,var(--vscode-charts-blue) 30%,var(--vscode-panel-border));border-radius:999px;font-size:10px;padding:1px 8px;margin:0 3px 3px 0}
    .progress-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.55}
    progress{width:100%;height:6px;border-radius:3px;border:none;display:block}
    progress::-webkit-progress-bar{background:var(--vscode-panel-border);border-radius:3px}
    progress::-webkit-progress-value{background:var(--vscode-progressBar-background,var(--vscode-charts-blue));border-radius:3px}
    .comment{display:grid;grid-template-columns:32px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid var(--vscode-panel-border)}
    .comment:last-child{border-bottom:none}
    .avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;margin-top:2px}
    .comment-meta{display:flex;align-items:baseline;gap:6px;margin-bottom:3px}
    .comment-author{font-weight:600;font-size:13px}
    .comment-date{opacity:.5;font-size:11px}
    .comment-body{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.5}
    .comment-actions{display:flex;justify-content:space-between;align-items:center;margin-top:8px}
    #error-banner{color:var(--vscode-errorForeground);padding:8px 12px;background:color-mix(in srgb,var(--vscode-errorForeground) 10%,transparent);border-radius:6px;margin-bottom:10px;display:none}
    </style></head><body>
    <div class="sticky-header">
      <div class="header-left">
        <h2 class="view-only">${safe(detail.title)}</h2>
        <input class="edit-only" id="edit-title" value="${safe(detail.title)}"/>
        <span class="badge status-${displayStatus} view-only">${statusLabel(displayStatus)}</span>
        <span class="badge priority-${detail.priority} view-only">${priorityLabel(detail.priority)}</span>
      </div>
      <div class="header-right">
        <button id="btn-edit" class="btn secondary view-only">Edit</button>
        <button id="btn-save" class="btn edit-only">Save</button>
        <button id="btn-cancel" class="btn secondary edit-only">Cancel</button>
        <button id="btn-close-x" class="btn-x" title="Close">×</button>
      </div>
    </div>
    <div class="content">
      <div id="error-banner"></div>
      <section class="panel">
        <div class="section-label">✏ Description</div>
        <div class="view-only desc-view" id="desc-view">${safe(detail.description ?? '—')}</div>
        <textarea class="edit-only" id="edit-description" rows="6">${safe(detail.description ?? '')}</textarea>
      </section>
      <section class="panel">
        <div class="section-label">Task Properties</div>
        <div class="props-grid">
          <div class="prop-cell">
            <div class="prop-head"><span class="prop-icon">👤</span><span class="prop-label">Assignee</span></div>
            <div class="prop-value view-only">${safe(detail.assignee ?? '—')}</div>
            <input class="edit-only" id="edit-assignee" value="${safe(detail.assignee ?? '')}"/>
          </div>
          <div class="prop-cell">
            <div class="prop-head"><span class="prop-icon">📅</span><span class="prop-label">Due Date</span></div>
            <div class="prop-value view-only">${safe(detail.dueDate ?? '—')}</div>
            <input class="edit-only" type="date" id="edit-dueDate" value="${safe(detail.dueDate ?? '')}"/>
          </div>
          <div class="prop-cell" style="grid-column:1/-1">
            <div class="prop-head"><span class="prop-icon">🏷</span><span class="prop-label">Tags</span></div>
            <div class="prop-value view-only">${tagChips}</div>
            <input class="edit-only" id="edit-tags" value="${safe(detail.tags.join(', '))}"/>
          </div>
        </div>
        <div class="edit-only" style="margin-bottom:12px">
          <div class="field"><label>Status</label><select id="edit-status"><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="review">Review</option><option value="done">Done</option></select></div>
          <div class="field"><label>Priority</label><select id="edit-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <div class="field"><label>Progress</label><input type="range" id="edit-progress" min="0" max="100" value="${detail.progress}"/></div>
        </div>
        <div class="view-only">
          <div class="progress-row"><span>Completion Progress</span><span>${detail.progress}%</span></div>
          <progress value="${detail.progress}" max="100"></progress>
        </div>
      </section>
      ${subtasks.length > 0 ? `<section class="panel"><div class="section-label">Subtasks</div>${subtasks.map(s => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0"><input type="checkbox" data-subtask-id="${s.taskId}" ${s.status === 'done' ? 'checked' : ''}/> <span>${safe(s.title)}</span> <span class="badge status-${s.status}">${statusLabel(s.status)}</span><span class="badge priority-${s.priority}">${priorityLabel(s.priority)}</span></label>`).join('')}</section>` : ''}
      <section class="panel">
        <div class="section-label">💬 Activity</div>
        <div id="comments">${commentRows.map(commentHtml).join('')}</div>
        <textarea id="comment-input" rows="3" placeholder="Type a message..." style="width:100%;margin-top:12px"></textarea>
        <div class="comment-actions">
          <button id="btn-comment-close" class="btn secondary">close comment</button>
          <button id="btn-comment-add" class="btn">comment</button>
        </div>
      </section>
    </div>
    <script>const vscode=acquireVsCodeApi();const orig=${JSON.stringify(detail)};
      const relTime=(iso)=>{const d=Date.now()-new Date(iso).getTime(),m=Math.floor(d/60000);if(m<1)return'just now';if(m<60)return m+' min'+(m>1?'s':'')+' ago';const h=Math.floor(m/60);if(h<24)return h+' h ago';const dy=Math.floor(h/24);return dy+' day'+(dy>1?'s':'')+' ago';};
      document.querySelectorAll('.comment-date[data-ts]').forEach(el=>{el.textContent=relTime(el.dataset.ts);});
      document.getElementById('btn-close-x').onclick=()=>vscode.postMessage({type:'detail:close'});
      document.getElementById('btn-edit').onclick=()=>{document.body.classList.add('editing');document.getElementById('edit-status').value=orig.status;document.getElementById('edit-priority').value=orig.priority;};
      document.getElementById('btn-cancel').onclick=()=>{document.getElementById('edit-title').value=orig.title;document.getElementById('edit-description').value=orig.description??'';document.getElementById('edit-assignee').value=orig.assignee??'';document.getElementById('edit-dueDate').value=orig.dueDate??'';document.getElementById('edit-tags').value=(orig.tags||[]).join(', ');document.getElementById('edit-status').value=orig.status;document.getElementById('edit-priority').value=orig.priority;document.getElementById('edit-progress').value=orig.progress;document.body.classList.remove('editing');};
      document.getElementById('btn-save').onclick=()=>{vscode.postMessage({type:'detail:save',title:document.getElementById('edit-title').value,description:document.getElementById('edit-description').value,status:document.getElementById('edit-status').value,priority:document.getElementById('edit-priority').value,assignee:document.getElementById('edit-assignee').value,dueDate:document.getElementById('edit-dueDate').value,tags:document.getElementById('edit-tags').value,progress:Number(document.getElementById('edit-progress').value)});};
      document.getElementById('btn-comment-close').onclick=()=>{const reason=document.getElementById('comment-input').value.trim();if(!reason){const b=document.getElementById('error-banner');b.textContent='Close reason is required.';b.style.display='block';return;}vscode.postMessage({type:'detail:closeWithComment',reason});};
      document.getElementById('btn-comment-add').onclick=()=>{const el=document.getElementById('comment-input');const body=el.value.trim();if(!body)return;vscode.postMessage({type:'detail:comment:add',body});el.value='';};
      document.querySelectorAll('[data-subtask-id]').forEach(el=>el.onchange=(e)=>{const t=e.target;vscode.postMessage({type:'detail:subtask:toggle',taskId:t.dataset.subtaskId,newStatus:t.checked?'done':'todo'});});
      document.getElementById('comment-input').addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();document.getElementById('btn-comment-add').click();}});
      document.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&document.body.classList.contains('editing')&&document.activeElement!==document.getElementById('comment-input')){e.preventDefault();document.getElementById('btn-save').click();}});
      const esc=(s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const renderComments=(cs)=>[...cs].filter(c=>!c.deletedAt).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(c=>{const isSystem=c.createdBy==='system';const initials=isSystem?'⚙':c.createdBy.trim().split(/\s+/).map(w=>w[0]??'').join('').slice(0,2).toUpperCase()||'?';const hue=[...(c.createdBy||'')].reduce((h,ch)=>h+ch.charCodeAt(0),0)%360;const bg=isSystem?'#888':'hsl('+hue+',60%,55%)';const bodyStyle=isSystem?' style="font-style:italic;opacity:.65"':'';return'<div class="comment"><div class="avatar" style="background:'+bg+'">'+initials+'</div><div><div class="comment-meta"><span class="comment-author">'+esc(c.createdBy)+'</span><span class="comment-date">'+relTime(c.createdAt)+'</span></div><div class="comment-body"'+bodyStyle+'>'+esc(c.body)+'</div></div></div>';}).join('');
      window.addEventListener('message',(event)=>{if(event.data?.type==='detail:comments:refresh'){document.getElementById('comments').innerHTML=renderComments(event.data.comments??[]);return;}if(event.data?.type==='detail:error'){const b=document.getElementById('error-banner');b.textContent=event.data.message||'error';b.style.display='block';}});
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
