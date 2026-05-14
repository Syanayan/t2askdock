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
  hasChildren?: boolean;
  isClosed?: boolean;
  isArchived?: boolean;
};

type WebviewCommandArgs = Record<string, unknown>;

export class BoardWebviewPanel {
  public static readonly VIEW_TYPE = 'taskDock.boardView';
  private messageListenerDisposable: vscode.Disposable | undefined;
  private onBack: (() => void) | undefined;
  private onRefresh: (() => Promise<void>) | undefined;
  private initPayload: { type: 'board:init'; tasks: unknown[] } | undefined;

  public constructor(
    private readonly moveTaskStatusUseCase: Pick<MoveTaskStatusUseCase, 'execute'>,
    private readonly eventBus: UiEventBus,
    private readonly executeCommand: (command: string, args?: WebviewCommandArgs) => Promise<unknown> = async () => undefined
  ) {}

  public render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>, tasks: BoardTask[], projectName?: string, userId?: string, projectId?: string, onBack?: () => void, onRefresh?: () => Promise<void>): void {
    panel.title = 'Task Dock Board';
    this.onBack = onBack;
    this.onRefresh = onRefresh;
    this.initPayload = { type: 'board:init', tasks: tasks.map((task, index) => ({ ...task, sequenceNumber: task.sequenceNumber ?? index + 1 })) };
    const resolvedProjectId = projectId ?? tasks[0]?.projectId ?? null;
    panel.webview.html = this.buildHtml(resolvedProjectId, projectName, userId, !!onBack);
    this.messageListenerDisposable?.dispose();
    this.messageListenerDisposable = panel.webview.onDidReceiveMessage?.(async (message: unknown) => {
      if (isBoardReadyMessage(message)) {
        void panel.webview.postMessage?.(this.initPayload);
        return;
      }
      if (isDropMessage(message)) {
        await this.onDrop({ ...message.task, toStatus: message.toStatus, actorId: 'system', now: new Date().toISOString() });
        return;
      }
      if (isCardOpenMessage(message)) {
        await this.executeCommand('taskDock.openTaskDetail', { taskId: message.taskId });
        return;
      }
      if (isCardMenuMessage(message) || isCardMenuActionMessage(message)) {
        await this.executeCommand(message.action === 'edit' ? 'taskDock.updateTask' : 'taskDock.deleteTask', { id: message.taskId, kind: 'task', label: message.taskId, hasChildren: false });
        return;
      }
      if (isBoardArchiveMessage(message)) {
        await this.executeCommand('taskDock.archiveTasksByIds', { taskIds: message.taskIds });
        return;
      }
      if (isCardCreateMessage(message)) {
        const { type: _type, ...createArgs } = message;
        await this.executeCommand('taskDock.openTaskCreate', createArgs);
        return;
      }
      if (isBoardBackMessage(message)) {
        this.onBack?.();
        return;
      }
      if (isBoardRefreshMessage(message)) {
        void this.onRefresh?.();
        return;
      }
    });
  }

  public refreshTasks(panel: Pick<vscode.WebviewPanel, 'webview'>, tasks: BoardTask[]): void {
    this.initPayload = { type: 'board:init', tasks: tasks.map((task, index) => ({ ...task, sequenceNumber: task.sequenceNumber ?? index + 1 })) };
    void panel.webview.postMessage(this.initPayload);
  }

  public renderDisconnected(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>): void {
    panel.title = 'Task Dock Board';
    panel.webview.html = `<!DOCTYPE html><html lang="ja"><body style="font-family:sans-serif;padding:16px;">DB未接続です。右上のDB選択から接続してください。</body></html>`;
  }

  private buildHtml(projectId: string | null, projectName?: string, userId?: string, showBack?: boolean): string {
    const dotColors = ['#93c5fd', '#fcd34d', '#c4b5fd', '#86efac'];
    const colLabels = ['Todo', 'In Progress', 'Review', 'Done'];
    const statuses = ['todo', 'in_progress', 'review', 'done'];
    const cols = statuses.map((s, i) =>
      `<div class="column" data-status="${s}"><div class="col-header"><span class="col-dot" style="background:${dotColors[i]}"></span><span class="col-title">${colLabels[i]}</span><span class="col-count" id="cnt-${s}">0</span></div><div class="tasks-area" id="col-${s}"></div></div>`
    ).join('');
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Task Board</title><style>
*{box-sizing:border-box}
body{font-family:var(--vscode-font-family,sans-serif);margin:0;padding:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}
.app-header{display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid var(--vscode-panel-border);flex-wrap:wrap}
.app-title{font-size:18px;font-weight:700;flex-shrink:0;white-space:nowrap}
.search-wrap{flex:1;max-width:220px;position:relative;min-width:100px}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:.4;font-size:14px;pointer-events:none}
.search-input{width:100%;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:999px;padding:5px 12px 5px 30px;color:var(--vscode-input-foreground);outline:none;font-size:13px}
.header-right{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.btn{cursor:pointer;border:1px solid var(--vscode-panel-border);border-radius:8px;padding:5px 12px;font-size:12px;background:transparent;color:var(--vscode-editor-foreground);font-family:inherit}
.btn:hover{background:var(--vscode-list-hoverBackground)}
.btn-primary{background:#0ea5e9;color:#fff;border-color:transparent;font-weight:600}
.btn-primary:hover{background:#0284c7}
.btn-active{background:color-mix(in srgb,#0ea5e9 15%,transparent);border-color:color-mix(in srgb,#0ea5e9 40%,transparent);color:#38bdf8}
.sb{display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;border:1px solid;white-space:nowrap;letter-spacing:.02em}
.sb-todo{background:rgba(59,130,246,.1);color:#93c5fd;border-color:rgba(59,130,246,.25)}
.sb-in_progress{background:rgba(245,158,11,.1);color:#fcd34d;border-color:rgba(245,158,11,.25)}
.sb-done{background:rgba(34,197,94,.1);color:#86efac;border-color:rgba(34,197,94,.25)}
.sb-review{background:rgba(139,92,246,.1);color:#c4b5fd;border-color:rgba(139,92,246,.25)}
.pb{display:inline-block;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;border:1px solid;white-space:nowrap}
.pb-critical{background:rgba(239,68,68,.12);color:#f87171;border-color:rgba(239,68,68,.25)}
.pb-high{background:rgba(249,115,22,.12);color:#fb923c;border-color:rgba(249,115,22,.25)}
.pb-medium{background:rgba(234,179,8,.12);color:#facc15;border-color:rgba(234,179,8,.25)}
.pb-low{background:rgba(34,197,94,.12);color:#4ade80;border-color:rgba(34,197,94,.25)}
.avatar{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0}
.board-wrap{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;padding:14px 16px;overflow-x:auto;align-items:flex-start}
.column{background:var(--vscode-sideBar-background);border-radius:12px;border:1px solid var(--vscode-panel-border);overflow:hidden;min-width:0}
.column.drag-over{border-color:#0ea5e9;background:color-mix(in srgb,#0ea5e9 4%,var(--vscode-sideBar-background))}
.col-header{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--vscode-panel-border)}
.col-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.col-title{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.65}
.col-count{margin-left:auto;font-size:11px;font-weight:700;background:color-mix(in srgb,var(--vscode-editor-foreground) 10%,transparent);border-radius:999px;padding:1px 7px;opacity:.55}
.tasks-area{padding:8px;display:flex;flex-direction:column;gap:6px;min-height:40px}
.task-card{background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-left-width:3px;border-radius:8px;padding:10px 12px;cursor:pointer;transition:border-color .12s,box-shadow .12s}
.task-card:hover{border-color:color-mix(in srgb,#0ea5e9 50%,var(--vscode-panel-border));box-shadow:0 2px 8px rgba(0,0,0,.15)}
.task-card[data-priority="critical"]{border-left-color:#f87171}
.task-card[data-priority="high"]{border-left-color:#fb923c}
.task-card[data-priority="medium"]{border-left-color:#facc15}
.task-card[data-priority="low"]{border-left-color:#4ade80}
.card-seq{font-size:10px;opacity:.3;font-weight:600;margin-bottom:4px}
.card-title{font-size:13px;font-weight:500;line-height:1.45;word-break:break-word;margin-bottom:8px}
.card-footer{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.card-due{font-size:11px;opacity:.5}
.card-due.overdue{color:#f87171;opacity:.9}
</style></head><body>
<header class="app-header">
  ${showBack ? '<button id="btn-back" class="btn" type="button">← 戻る</button>' : ''}
  <span class="app-title">${projectName ?? 'Task Board'}</span>
  <div class="search-wrap"><span class="search-icon">⌕</span><input class="search-input" id="search-box" placeholder="検索..." type="search"/></div>
  <div class="header-right">
    <button id="btn-refresh" class="btn" type="button" title="Refresh">↺</button>
    <button id="my-tasks-toggle" class="btn" type="button">マイタスク</button>
    <button id="add-task" class="btn btn-primary" type="button">+ Add Task</button>
  </div>
</header>
<div class="board-wrap">${cols}</div>
<script>
const vscode=acquireVsCodeApi();
let tasks=[];let myTasksOnly=false;let searchQuery='';let draggingTaskId=null;
let projectId=${JSON.stringify(projectId)};
const currentUserId=${JSON.stringify(userId ?? 'system')};
const statuses=['todo','in_progress','review','done'];
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const effectiveStatus=t=>t.isArchived?'archived':(t.isClosed||t.status==='close'?'close':t.status);
const visibleKanbanTask=t=>!t.isArchived&&!(t.isClosed||t.status==='close');
const matchesFilters=t=>{const q=searchQuery.toLowerCase();return(!myTasksOnly||t.assignee===currentUserId)&&(!q||t.title.toLowerCase().includes(q)||((t.assignee??'').toLowerCase().includes(q)));};
const avatarEl=a=>{if(!a)return'';const ini=a.trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?';const hue=[...a].reduce((h,c)=>h+c.charCodeAt(0),0)%360;return'<div class="avatar" style="background:hsl('+hue+',55%,45%)">'+ini+'</div>';};
const priLabel={low:'Low',medium:'Med',high:'High',critical:'Crit'};
const render=()=>{
  for(const status of statuses){
    const inStatus=tasks.filter(t=>effectiveStatus(t)===status&&matchesFilters(t)&&visibleKanbanTask(t));
    document.getElementById('cnt-'+status).textContent=String(inStatus.length);
    const area=document.getElementById('col-'+status);area.innerHTML='';
    for(const task of inStatus){
      const el=document.createElement('div');
      el.className='task-card';el.dataset.taskId=task.taskId;el.dataset.priority=task.priority;el.draggable=true;
      const today=new Date().toISOString().slice(0,10);
      const dueStr=task.dueDate?('<span class="card-due'+(task.dueDate<today?' overdue':'')+'">📅 '+new Date(task.dueDate).toLocaleDateString('ja-JP')+'</span>'):'';
      el.innerHTML='<div class="card-seq">#'+(task.sequenceNumber??'')+'</div><div class="card-title">'+esc(task.title)+'</div><div class="card-footer"><span class="pb pb-'+task.priority+'">'+(priLabel[task.priority]??task.priority)+'</span>'+avatarEl(task.assignee)+dueStr+'</div>';
      el.addEventListener('click',()=>vscode.postMessage({type:'card:open',taskId:task.taskId}));
      el.addEventListener('dragstart',()=>{draggingTaskId=task.taskId;el.style.opacity='.35';});
      el.addEventListener('dragend',()=>{el.style.opacity='';draggingTaskId=null;});
      area.appendChild(el);
    }
  }
};
${showBack ? "document.getElementById('btn-back').addEventListener('click',()=>vscode.postMessage({type:'board:back'}));" : ''}
document.getElementById('search-box').addEventListener('input',e=>{searchQuery=e.target.value;render();});
document.getElementById('btn-refresh').addEventListener('click',()=>vscode.postMessage({type:'board:refresh'}));
document.getElementById('my-tasks-toggle').addEventListener('click',function(){myTasksOnly=!myTasksOnly;this.classList.toggle('btn-active',myTasksOnly);render();});
document.getElementById('add-task').addEventListener('click',()=>vscode.postMessage({type:'card:create',status:'todo',projectId}));
document.querySelectorAll('.column').forEach(col=>{
  col.addEventListener('dragover',e=>{e.preventDefault();document.querySelectorAll('.column').forEach(c=>c.classList.remove('drag-over'));col.classList.add('drag-over');});
  col.addEventListener('dragleave',()=>col.classList.remove('drag-over'));
  col.addEventListener('drop',()=>{
    document.querySelectorAll('.column').forEach(c=>c.classList.remove('drag-over'));
    if(!draggingTaskId)return;
    const task=tasks.find(t=>t.taskId===draggingTaskId);if(!task)return;
    const toStatus=col.dataset.status;if(task.status===toStatus)return;
    const{version,...rest}=task;
    vscode.postMessage({type:'board:drop',task:{...rest,expectedVersion:version},toStatus});
    task.status=toStatus;task.version+=1;render();
  });
});
const normalizeTreeTasks=(nodes,parentId=null)=>{const out=[];for(const node of nodes??[]){const{children=[],...rest}=node;out.push({...rest,parentTaskId:rest.parentTaskId??parentId});if(children.length>0)out.push(...normalizeTreeTasks(children,node.taskId));}return out;};
window.addEventListener('message',e=>{if(e.data?.type==='board:init'){tasks=normalizeTreeTasks(e.data.tasks??[]);if(!projectId)projectId=tasks[0]?.projectId??null;render();}});
vscode.postMessage({type:'board:ready'});
</script></body></html>`;
  }

  public async onDrop(input: { taskId: string; projectId: string; actorId: string; toStatus: TaskStatus; title: string; description: string | null; priority: Priority; assignee: string | null; dueDate: string | null; tags: string[]; parentTaskId: string | null; expectedVersion: number; now: string; }): Promise<{ taskId: string; status: TaskStatus; version: number }> {
    const output = await this.moveTaskStatusUseCase.execute({ ...input, toStatus: input.toStatus });
    this.eventBus.publish({ type: 'TASK_UPDATED', payload: { taskId: output.id, status: output.status, version: output.version } });
    return { taskId: output.id, status: output.status, version: output.version };
  }
}

function isDropMessage(value: unknown): value is { type: 'board:drop'; task: Omit<Parameters<BoardWebviewPanel['onDrop']>[0], 'toStatus' | 'actorId' | 'now'>; toStatus: TaskStatus } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!(candidate.type === 'board:drop' && typeof candidate.toStatus === 'string' && typeof candidate.task === 'object' && candidate.task)) return false;
  const task = candidate.task as Record<string, unknown>;
  return typeof task.expectedVersion === 'number';
}
function isCardOpenMessage(value: unknown): value is { type: 'card:open'; taskId: string } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'card:open' && typeof candidate.taskId === 'string';
}
function isCardMenuMessage(value: unknown): value is { type: 'card:menu'; action: 'edit' | 'delete'; taskId: string } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'card:menu' && (candidate.action === 'edit' || candidate.action === 'delete') && typeof candidate.taskId === 'string';
}
function isCardCreateMessage(value: unknown): value is { type: 'card:create'; status: TaskStatus; title?: string; projectId?: string; priority?: Priority; assignee?: string | null; dueDate?: string | null; tags?: string[] } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'card:create' && ['todo', 'in_progress', 'review', 'done'].includes(String(c.status)) && (c.title === undefined || typeof c.title === 'string') && (c.projectId === undefined || typeof c.projectId === 'string') && (c.priority === undefined || ['low', 'medium', 'high', 'critical'].includes(String(c.priority))) && (c.assignee === undefined || c.assignee === null || typeof c.assignee === 'string') && (c.dueDate === undefined || c.dueDate === null || typeof c.dueDate === 'string') && (c.tags === undefined || (Array.isArray(c.tags) && c.tags.every(tag => typeof tag === 'string')));
}

function isBoardArchiveMessage(value: unknown): value is { type: 'board:archive'; taskIds: string[] } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'board:archive' && Array.isArray(candidate.taskIds);
}

function isCardMenuActionMessage(value: unknown): value is { type: 'card:menuAction'; action: 'edit' | 'delete'; taskId: string } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'card:menuAction' && (candidate.action === 'edit' || candidate.action === 'delete') && typeof candidate.taskId === 'string';
}

function isBoardBackMessage(value: unknown): value is { type: 'board:back' } {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).type === 'board:back';
}

function isBoardReadyMessage(value: unknown): value is { type: 'board:ready' } {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).type === 'board:ready';
}

function isBoardRefreshMessage(value: unknown): value is { type: 'board:refresh' } {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).type === 'board:refresh';
}
