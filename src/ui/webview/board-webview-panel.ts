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

  public constructor(
    private readonly moveTaskStatusUseCase: Pick<MoveTaskStatusUseCase, 'execute'>,
    private readonly eventBus: UiEventBus,
    private readonly executeCommand: (command: string, args?: WebviewCommandArgs) => Promise<unknown> = async () => undefined
  ) {}

  public render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>, tasks: BoardTask[], projectName?: string, userId?: string, projectId?: string, onBack?: () => void): void {
    panel.title = 'Task Dock Board';
    this.onBack = onBack;
    const resolvedProjectId = projectId ?? tasks[0]?.projectId ?? null;
    panel.webview.html = this.buildHtml(resolvedProjectId, projectName, userId, !!onBack);
    this.messageListenerDisposable?.dispose();
    this.messageListenerDisposable = panel.webview.onDidReceiveMessage?.(async (message: unknown) => {
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
    });
    void panel.webview.postMessage?.({ type: 'board:init', tasks: tasks.map((task, index) => ({ ...task, sequenceNumber: task.sequenceNumber ?? index + 1 })) });
  }

  public renderDisconnected(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>): void {
    panel.title = 'Task Dock Board';
    panel.webview.html = `<!DOCTYPE html><html lang="ja"><body style="font-family:sans-serif;padding:16px;">DB未接続です。右上のDB選択から接続してください。</body></html>`;
  }

  private buildHtml(projectId: string | null, projectName?: string, userId?: string, showBack?: boolean): string {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Task Dock Board</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:16px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}.toolbar{display:flex;justify-content:space-between;gap:8px;margin:8px 0}.toolbar-left{display:flex;gap:8px;align-items:center}.toolbar-right{display:flex;gap:8px;align-items:center}.toolbar button{border:1px solid var(--vscode-panel-border);background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer}.toolbar button[disabled]{opacity:.5;cursor:not-allowed}#my-tasks-toggle{border-radius:999px;padding:6px 12px;font-weight:600;letter-spacing:.2px;background:color-mix(in srgb,var(--vscode-button-secondaryBackground) 70%,transparent);color:var(--vscode-button-secondaryForeground);border:1px solid color-mix(in srgb,var(--vscode-focusBorder) 35%,var(--vscode-panel-border));transition:all .16s ease;box-shadow:0 1px 2px rgba(0,0,0,.12)}#my-tasks-toggle:hover{box-shadow:0 4px 10px rgba(0,0,0,.16)}#my-tasks-toggle.toggle-active{background:linear-gradient(135deg,color-mix(in srgb,var(--vscode-charts-blue) 85%,#2b7fff),color-mix(in srgb,var(--vscode-charts-purple) 65%,#6d5cff));border-color:color-mix(in srgb,var(--vscode-charts-blue) 70%,#2b7fff);color:#fff;box-shadow:0 6px 16px color-mix(in srgb,var(--vscode-charts-blue) 35%,transparent)}
#search-box{width:180px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);border-radius:6px;padding:5px 10px;font-size:12px}.board{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin-top:12px}
.column{background:var(--vscode-sideBar-background);border-radius:10px;padding:12px;min-height:120px;border:none;border-top-width:4px}.column.drag-over{background:var(--vscode-editorGroup-dropBackground);outline:2px dashed var(--vscode-focusBorder)}.column[data-status="todo"]{border-top-color:#2196F3}.column[data-status="in_progress"]{border-top-color:#4CAF50}.column[data-status="blocked"]{border-top-color:#F44336}.column[data-status="done"]{border-top-color:#9C27B0}
.column-header{margin-bottom:6px}.column h3{margin:0;font-size:13px}.count-badge{font-size:11px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:1px 6px}
.task{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:6px;margin-bottom:6px;background:var(--vscode-editor-background);cursor:grab}.task:hover{background:var(--vscode-list-hoverBackground)}.task-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.task-seq{font-size:11px;color:#555}.task-meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.badge{font-size:11px;border-radius:999px;font-weight:600;padding:2px 8px}.priority-low{background:#f0f0f0;color:#666}.priority-medium{background:color-mix(in srgb,var(--vscode-charts-yellow) 15%,transparent);color:var(--vscode-editor-foreground);border:1px solid color-mix(in srgb,var(--vscode-charts-yellow) 35%,var(--vscode-panel-border))}.priority-high{background:#ffedd5;color:#9a3412}.priority-critical{background:#fee2e2;color:#991b1b}.due-overdue{color:#b91c1c}
.card-menu{position:relative}.card-menu-btn{border:1px solid var(--vscode-panel-border);background:var(--vscode-toolbar-hoverBackground);color:var(--vscode-editor-foreground);border-radius:4px;padding:0 6px;cursor:pointer}.card-menu-popup{position:absolute;right:0;top:24px;z-index:20;min-width:140px;border:1px solid var(--vscode-menu-border);background:var(--vscode-menu-background);color:var(--vscode-menu-foreground);box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:6px;padding:4px 0}.card-menu-item{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:6px 10px;cursor:pointer}.card-menu-item:hover,.card-menu-item:focus{background:var(--vscode-list-hoverBackground)}
</style></head><body><h2>${projectName ?? 'Task Board'}</h2><div class="toolbar"><div class="toolbar-left">${showBack ? '<button id="btn-back" type="button">← 戻る</button>' : ''}<input type="search" id="search-box" placeholder="検索..."/><button type="button" id="my-tasks-toggle">マイタスク: OFF</button></div><div class="toolbar-right"><button id="add-task" type="button">Add Task</button></div></div><section class="board">${['todo','in_progress','blocked','done'].map((s,i)=>`<article class="column" data-status="${s}"><div class="column-header"><h3>${['Todo','In Progress','Blocked','Done'][i]} <span class="count-badge">0</span></h3></div><div class="tasks"></div></article>`).join('')}</section>
<script>const vscode=acquireVsCodeApi();let tasks=[];let myTasksOnly=false;let searchQuery='';let projectId=${JSON.stringify(projectId)};const statuses=['todo','in_progress','blocked','done'];
const currentUserId=${JSON.stringify(userId ?? 'system')};const syncMyTasksToggle=()=>{const btn=document.getElementById('my-tasks-toggle');btn.textContent=(myTasksOnly?'● ':'○ ')+'マイタスク';btn.classList.toggle('toggle-active',myTasksOnly);};const matchesFilters=t=>{const q=searchQuery.toLowerCase();const m=!q||t.title.toLowerCase().includes(q)||((t.assignee??'').toLowerCase().includes(q))||((t.tags??[]).some(tag=>tag.toLowerCase().includes(q)));return (!myTasksOnly||t.assignee===currentUserId)&&m;};
const effectiveStatus=t=>t.isArchived?'archived':(t.isClosed||t.status==='close'?'close':t.status);const visibleKanbanTask=t=>!t.isArchived&&!(t.isClosed||t.status==='close');
const render=()=>{syncMyTasksToggle();for(const status of statuses){const inStatus=tasks.filter(t=>effectiveStatus(t)===status&&matchesFilters(t)&&visibleKanbanTask(t));const list=document.querySelector('.column[data-status="'+status+'"] .tasks');document.querySelector('.column[data-status="'+status+'"] .count-badge').textContent=String(inStatus.length);list.innerHTML='';for(const task of inStatus){const el=document.createElement('div');el.className='task';const dueClass=task.dueDate&&new Date(task.dueDate).toISOString().slice(0,10)<new Date().toISOString().slice(0,10)?'due-overdue':'';const priorityBadge='<span class="badge priority-'+task.priority+'">'+({low:'Low',medium:'Medium',high:'High',critical:'Critical'}[task.priority]??task.priority)+'</span>';const due=task.dueDate?'<span class="badge '+dueClass+'">'+new Date(task.dueDate).toLocaleDateString('ja-JP')+'</span>':'';const assigneeBadge=task.assignee?'<span class="badge" style="background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)">@'+task.assignee+'</span>':'';el.innerHTML='<div class="task-header"><span class="task-seq">#'+(task.sequenceNumber??'')+'</span><div class="card-menu"><button type="button" class="card-menu-btn" data-action="menu" aria-haspopup="menu" aria-expanded="false">...</button></div></div><div>'+task.title+'</div><div class="task-meta">'+priorityBadge+due+assigneeBadge+'</div>';el.draggable=true;el.dataset.taskId=task.taskId;el.querySelector('button[data-action="menu"]').addEventListener('click',(e)=>{e.stopPropagation();document.querySelectorAll('.card-menu-popup').forEach(menu=>menu.remove());const wrap=el.querySelector('.card-menu');const button=el.querySelector('button[data-action="menu"]');const popup=document.createElement('div');popup.className='card-menu-popup';popup.setAttribute('role','menu');const isDone=task.status==='done';popup.innerHTML='<button type="button" class="card-menu-item" data-menu-action="edit" role="menuitem" '+(isDone?'disabled aria-disabled="true"':'')+'>編集</button><button type="button" class="card-menu-item" data-menu-action="delete" role="menuitem">削除</button>';wrap.appendChild(popup);button.setAttribute('aria-expanded','true');const close=()=>{popup.remove();button.setAttribute('aria-expanded','false');};const items=[...popup.querySelectorAll('[data-menu-action]')];items.forEach(item=>item.addEventListener('click',evt=>{evt.stopPropagation();if(item.hasAttribute('disabled'))return;vscode.postMessage({type:'card:menuAction',action:item.dataset.menuAction,taskId:task.taskId});close();}));popup.addEventListener('keydown',evt=>{if(evt.key==='Escape'){close();button.focus();return;}const currentIndex=items.findIndex(item=>item===document.activeElement);if(evt.key==='ArrowDown'){evt.preventDefault();const next=(currentIndex+1+items.length)%items.length;items[next]?.focus();}if(evt.key==='ArrowUp'){evt.preventDefault();const prev=(currentIndex-1+items.length)%items.length;items[prev]?.focus();}if(evt.key==='Enter'){const active=document.activeElement;if(active instanceof HTMLElement&&active.dataset.menuAction&&!active.hasAttribute('disabled')){evt.preventDefault();vscode.postMessage({type:'card:menuAction',action:active.dataset.menuAction,taskId:task.taskId});close();}}});popup.addEventListener('focusout',evt=>{if(!popup.contains(evt.relatedTarget)){close();}});setTimeout(()=>{const onDocClick=(evt)=>{if(!wrap.contains(evt.target)){close();document.removeEventListener('click',onDocClick,true);}};document.addEventListener('click',onDocClick,true);items.find(item=>!item.hasAttribute('disabled'))?.focus();},0);});el.addEventListener('click',()=>vscode.postMessage({type:'card:open',taskId:task.taskId}));el.addEventListener('dragstart',()=>el.dataset.dragging='true');el.addEventListener('dragend',()=>delete el.dataset.dragging);list.appendChild(el);}}};
${showBack ? "document.getElementById('btn-back').addEventListener('click',()=>vscode.postMessage({type:'board:back'}));" : ''}document.getElementById('search-box').addEventListener('input',e=>{searchQuery=e.target.value;render();});document.getElementById('my-tasks-toggle').addEventListener('click',()=>{myTasksOnly=!myTasksOnly;render();});
document.getElementById('add-task').addEventListener('click',()=>{vscode.postMessage({type:'card:create',status:'todo',projectId});});
document.querySelectorAll('.column').forEach(column=>{column.addEventListener('dragover',(event)=>{event.preventDefault();document.querySelectorAll('.column').forEach(c=>c.classList.remove('drag-over'));column.classList.add('drag-over');});column.addEventListener('dragleave',()=>column.classList.remove('drag-over'));column.addEventListener('drop',()=>{document.querySelectorAll('.column').forEach(c=>c.classList.remove('drag-over'));const dragging=document.querySelector('.task[data-dragging="true"]');if(!dragging)return;const task=tasks.find(t=>t.taskId===dragging.dataset.taskId);if(!task)return;const toStatus=column.dataset.status;if(task.status===toStatus)return;const {version,...taskWithoutVersion}=task;vscode.postMessage({type:'board:drop',task:{...taskWithoutVersion,expectedVersion:version},toStatus});task.status=toStatus;task.version+=1;render();});});const normalizeTreeTasks=(nodes,parentTaskId=null)=>{const out=[];for(const node of nodes??[]){const {children=[],...rest}=node;const normalized={...rest,parentTaskId:rest.parentTaskId??parentTaskId};out.push(normalized);if(Array.isArray(children)&&children.length>0){out.push(...normalizeTreeTasks(children,node.taskId));}}return out;};window.addEventListener('message',(event)=>{if(event.data?.type==='board:init'){tasks=normalizeTreeTasks(event.data.tasks??[]);if(!projectId){projectId=tasks[0]?.projectId??null;}render();}});
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
  return c.type === 'card:create' && ['todo', 'in_progress', 'blocked', 'done'].includes(String(c.status)) && (c.title === undefined || typeof c.title === 'string') && (c.projectId === undefined || typeof c.projectId === 'string') && (c.priority === undefined || ['low', 'medium', 'high', 'critical'].includes(String(c.priority))) && (c.assignee === undefined || c.assignee === null || typeof c.assignee === 'string') && (c.dueDate === undefined || c.dueDate === null || typeof c.dueDate === 'string') && (c.tags === undefined || (Array.isArray(c.tags) && c.tags.every(tag => typeof tag === 'string')));
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
