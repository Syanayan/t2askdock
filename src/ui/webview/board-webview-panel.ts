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
};

type CreateTaskCommandArgs = {
  taskId?: string;
  status?: TaskStatus;
  title?: string;
  projectId?: string;
  priority?: Priority;
  assignee?: string | null;
  dueDate?: string | null;
  tags?: string[];
};

export class BoardWebviewPanel {
  public static readonly VIEW_TYPE = 'taskDock.boardView';

  public constructor(
    private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
    private readonly eventBus: UiEventBus,
    private readonly executeCommand: (command: string, args?: CreateTaskCommandArgs) => Promise<unknown> = async () => undefined
  ) {}

  public render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>, tasks: BoardTask[]): void {
    panel.title = 'Task Dock Board';
    const projectId = tasks[0]?.projectId ?? null;
    panel.webview.html = this.buildHtml(projectId);
    panel.webview.onDidReceiveMessage?.(async (message: unknown) => {
      if (isDropMessage(message)) {
        await this.onDrop({ ...message.task, toStatus: message.toStatus, actorId: 'system', now: new Date().toISOString() });
        return;
      }
      if (isCardOpenMessage(message)) {
        await this.executeCommand('taskDock.openTaskDetail', { taskId: message.taskId });
        return;
      }
      if (isCardMenuMessage(message)) {
        await this.executeCommand(message.action === 'edit' ? 'taskDock.updateTask' : 'taskDock.deleteTask', { taskId: message.taskId });
        return;
      }
      if (isCardCreateMessage(message)) {
        const { type: _type, ...createArgs } = message;
        await this.executeCommand('taskDock.createTask', createArgs);
      }
    });
    void panel.webview.postMessage?.({ type: 'board:init', tasks: tasks.map((task, index) => ({ ...task, sequenceNumber: task.sequenceNumber ?? index + 1 })) });
  }

  private buildHtml(projectId: string | null): string {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Task Dock Board</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:16px}.hint{color:#666;font-size:12px}.toolbar{display:flex;justify-content:space-between;gap:8px;margin:8px 0}.toolbar-left,.toolbar-right{display:flex;gap:8px}.toolbar button{border:1px solid #ccc;background:#f7f7f7;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer}.toolbar button[disabled]{opacity:.5;cursor:not-allowed}
#search-box{width:180px;border:1px solid #ccc;border-radius:6px;padding:5px 10px;font-size:12px}.view-tab{border:1px solid #ccc;padding:4px 10px;background:#f7f7f7;cursor:pointer}.view-tab.active{background:#007acc;color:#fff;border-color:#007acc}
.board{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin-top:12px}.list-view{margin-top:12px}.task-table-wrap{border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}.task-table{width:100%;border-collapse:collapse}.task-table th,.task-table td{font-size:12px;border-bottom:1px solid #e5e5e5;padding:6px;text-align:left}.task-table th{background:#F1F5F9;font-weight:600;cursor:pointer}.task-table tr:nth-child(even){background:#FAFAFA}.task-table tr:hover{background:#F0F4FF}
.column{background:#F8F9FA;border-radius:10px;padding:12px;min-height:120px;border:none;border-top-width:4px}.column.drag-over{background:#f0f7ff;outline:2px dashed #2196F3}.column[data-status="todo"]{border-top-color:#2196F3}.column[data-status="in_progress"]{border-top-color:#4CAF50}.column[data-status="blocked"]{border-top-color:#F44336}.column[data-status="done"]{border-top-color:#9C27B0}
.column-header{margin-bottom:6px}.column h3{margin:0;font-size:13px}.count-badge{font-size:11px;border-radius:999px;background:#eee;padding:1px 6px}.add-task{width:100%;margin-bottom:8px;border:1px dashed #bbb;background:#fafafa;border-radius:6px;padding:4px;font-size:12px;cursor:pointer}
.task{box-shadow:0 1px 3px rgba(0,0,0,.08);border-radius:8px;padding:6px;margin-bottom:6px;background:#fff;cursor:grab;border:none;transition:box-shadow .15s,transform .15s}.task:hover{box-shadow:0 4px 12px rgba(0,0,0,.12);transform:translateY(-1px)}.task-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.task-seq{font-size:11px;color:#555}.task-desc{font-size:12px;color:#666;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:4px 0}.task-meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.badge{font-size:11px;border-radius:999px;font-weight:600;padding:2px 8px}.priority-low{background:#f0f0f0;color:#666}.priority-high{background:#ffedd5;color:#9a3412}.priority-critical{background:#fee2e2;color:#991b1b}.due-overdue{color:#b91c1c}
.status-todo{background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE}.status-in_progress{background:#FFFBEB;color:#B45309;border:1px solid #FDE68A}.status-done{background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0}.status-blocked{background:#FFF1F2;color:#BE123C;border:1px solid #FECDD3}.status-select{border-radius:6px;padding:2px 4px}
.inline-create{display:none;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);padding:8px;background:#fff;margin-bottom:8px}.inline-create.show{display:block}.ic-title{width:100%;box-sizing:border-box}.ic-row{display:flex;gap:4px;margin-top:4px}.ic-row input,.ic-row select{flex:1;font-size:11px}.ic-actions{display:flex;gap:4px;margin-top:6px}body.collapsed .task-desc,body.collapsed .task-meta{display:none}
</style></head><body><h2>Task Board</h2><div class="toolbar"><div class="toolbar-left"><input type="search" id="search-box" placeholder="検索..."/><button type="button" id="my-tasks-toggle">マイタスク</button><button type="button" id="collapse-toggle">折り畳む</button><button type="button" id="done-toggle">Done を表示</button></div><div class="toolbar-right view-switcher"><button id="view-kanban" class="view-tab" type="button">カンバン</button><button id="view-list" class="view-tab active" type="button">リスト</button></div></div><p class="hint">カードをドラッグ&ドロップして状態を更新できます。</p>
<section class="board">${['todo','in_progress','blocked','done'].map((s,i)=>`<article class="column" data-status="${s}"><div class="column-header"><h3>${['Todo','In Progress','Blocked','Done'][i]} <span class="badge status-${s}">${['Todo','In Progress','Blocked','Done'][i]}</span> <span class="count-badge">0</span></h3></div><button class="add-task" type="button">+ タスクを追加</button><div class="inline-create"><input type="text" class="ic-title" placeholder="タスクタイトル（必須）"/><div class="ic-row"><select class="ic-priority"><option value="low">低</option><option value="medium" selected>中</option><option value="high">高</option><option value="critical">最高</option></select><input type="date" class="ic-due"/><input type="text" class="ic-assignee" placeholder="担当者"/><input type="text" class="ic-tags" placeholder="タグ (カンマ区切り)"/></div><div class="ic-actions"><button class="ic-submit" type="button">追加</button><button class="ic-cancel" type="button">キャンセル</button></div></div><div class="tasks"></div></article>`).join('')}</section>
<section class="list-view" style="display:block"><div class="task-table-wrap"><table class="task-table"><thead><tr><th data-col="title">Title</th><th data-col="status">Status</th><th data-col="assignee">Assignee</th><th data-col="priority">Priority</th><th data-col="dueDate">Due</th><th>Progress</th></tr></thead><tbody class="task-rows"></tbody></table></div></section>
<script>const vscode=acquireVsCodeApi();let tasks=[];let myTasksOnly=false;let searchQuery='';const saved=vscode.getState();let currentView=saved?.currentView??'list';let projectId=${JSON.stringify(projectId)};let showDoneInList=false;const expanded=new Set();let listSort={col:'title',dir:'asc'};const statuses=['todo','in_progress','blocked','done'];const priorityOrder={critical:0,high:1,medium:2,low:3};
const matchesFilters=t=>{const q=searchQuery.toLowerCase();const m=!q||t.title.toLowerCase().includes(q)||((t.assignee??'').toLowerCase().includes(q))||((t.tags??[]).some(tag=>tag.toLowerCase().includes(q)));return (!myTasksOnly||t.assignee==='system')&&m;};
const statusLabel=s=>({todo:'Todo',in_progress:'In Progress',blocked:'Blocked',done:'Done'}[s]??s);
const resetInline=i=>{i.classList.remove('show');i.querySelector('.ic-title').value='';i.querySelector('.ic-priority').value='medium';i.querySelector('.ic-due').value='';i.querySelector('.ic-assignee').value='';i.querySelector('.ic-tags').value='';};
const postCreate=(inline,status)=>{const title=inline.querySelector('.ic-title').value.trim();if(!title)return;const due=inline.querySelector('.ic-due').value.trim();const assignee=inline.querySelector('.ic-assignee').value.trim();const tagsRaw=inline.querySelector('.ic-tags').value.trim();vscode.postMessage({type:'card:create',status,projectId,title,priority:inline.querySelector('.ic-priority').value,dueDate:due||null,assignee:assignee||null,tags:tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):[]});resetInline(inline)};
const render=()=>{for(const status of statuses){const inStatus=tasks.filter(t=>t.status===status&&matchesFilters(t));const list=document.querySelector('.column[data-status="'+status+'"] .tasks');document.querySelector('.column[data-status="'+status+'"] .count-badge').textContent=String(inStatus.length);list.innerHTML='';for(const task of inStatus){const el=document.createElement('div');el.className='task';const dueClass=task.dueDate&&new Date(task.dueDate).toISOString().slice(0,10)<new Date().toISOString().slice(0,10)?'due-overdue':'';const priorityBadge=task.priority==='medium'?'':'<span class="badge priority-'+task.priority+'">優先度:'+({low:'低',high:'高',critical:'最高'}[task.priority]??'')+'</span>';const statusBadge='<span class="badge status-'+task.status+'">'+statusLabel(task.status)+'</span>';const due=task.dueDate?'<span class="badge '+dueClass+'">'+new Date(task.dueDate).toLocaleDateString('ja-JP')+'</span>':'';el.innerHTML='<div class="task-header"><span class="task-seq">#'+(task.sequenceNumber??'')+'</span><button type="button" data-action="menu">...</button></div><div>'+task.title+'</div><div class="task-meta">'+statusBadge+priorityBadge+due+'</div>';el.draggable=true;el.dataset.taskId=task.taskId;el.querySelector('button[data-action="menu"]').addEventListener('click',(e)=>{e.stopPropagation();const action=window.confirm('編集する場合はOK、削除はキャンセル')?'edit':'delete';vscode.postMessage({type:'card:menu',action,taskId:task.taskId});});el.addEventListener('click',()=>vscode.postMessage({type:'card:open',taskId:task.taskId}));el.addEventListener('dragstart',()=>el.dataset.dragging='true');el.addEventListener('dragend',()=>delete el.dataset.dragging);list.appendChild(el);}};renderList();};
const sorted=(arr)=>arr.sort((a,b)=>{const c=listSort.col;const d=listSort.dir==='asc'?1:-1;if(c==='priority')return ((priorityOrder[a.priority]??9)-(priorityOrder[b.priority]??9))*d;if(c==='status')return String(a.status).localeCompare(String(b.status))*d;if(c==='dueDate')return String(a.dueDate??'').localeCompare(String(b.dueDate??''))*d;return String(a[c]??'').localeCompare(String(b[c]??''))*d;});
const renderList=()=>{const body=document.querySelector('.task-rows');body.innerHTML='';const byParent=new Map();for(const task of tasks.filter(t=>matchesFilters(t)&&(showDoneInList||t.status!=='done'))){const key=task.parentTaskId??'root';const curr=byParent.get(key)??[];curr.push(task);byParent.set(key,curr);}const addRows=(parentId,depth)=>{const rows=sorted([...(byParent.get(parentId)??[])]);for(const task of rows){const isOpen=expanded.has(task.taskId);const hasChildren=(byParent.get(task.taskId)?.length??0)>0;const tr=document.createElement('tr');const toggle=hasChildren?'<button type="button" class="expand" data-task-id="'+task.taskId+'">'+(isOpen?'▼':'▶')+'</button> ':'';tr.innerHTML='<td>'+('&nbsp;'.repeat(depth*4))+toggle+task.title+'</td><td><select class="status-select status-'+task.status+'" data-task-id="'+task.taskId+'"><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></td><td>'+(task.assignee??'-')+'</td><td>'+task.priority+'</td><td>'+(task.dueDate??'-')+'</td><td>'+(task.hasChildren?'サブタスクあり':'-')+'</td>';tr.querySelector('.status-select').value=task.status;tr.querySelector('.status-select').addEventListener('click',e=>e.stopPropagation());tr.querySelector('.status-select').addEventListener('change',e=>{e.stopPropagation();const newStatus=e.target.value;if(task.status===newStatus)return;const {version,...taskWithoutVersion}=task;vscode.postMessage({type:'board:drop',task:{...taskWithoutVersion,expectedVersion:version},toStatus:newStatus});task.status=newStatus;task.version+=1;renderList();});const btn=tr.querySelector('.expand');if(btn){btn.addEventListener('click',e=>{e.stopPropagation();if(expanded.has(task.taskId))expanded.delete(task.taskId);else expanded.add(task.taskId);renderList();});}tr.addEventListener('click',()=>vscode.postMessage({type:'card:open',taskId:task.taskId}));body.appendChild(tr);if(!hasChildren||isOpen)addRows(task.taskId,depth+1);}};addRows('root',0);document.querySelectorAll('th[data-col]').forEach(th=>{const col=th.dataset.col;th.textContent=th.textContent.split(' ')[0]+(listSort.col===col?(listSort.dir==='asc'?' ▲':' ▼'):'');});};
const renderView=()=>{document.querySelector('.board').style.display=currentView==='kanban'?'grid':'none';document.querySelector('.list-view').style.display=currentView==='list'?'block':'none';document.getElementById('view-kanban').classList.toggle('active',currentView==='kanban');document.getElementById('view-list').classList.toggle('active',currentView==='list');vscode.setState({currentView});};
document.getElementById('search-box').addEventListener('input',e=>{searchQuery=e.target.value;render();});document.getElementById('my-tasks-toggle').addEventListener('click',()=>{myTasksOnly=!myTasksOnly;render();});document.getElementById('collapse-toggle').addEventListener('click',()=>document.body.classList.toggle('collapsed'));document.getElementById('done-toggle').addEventListener('click',()=>{showDoneInList=!showDoneInList;document.getElementById('done-toggle').textContent=showDoneInList?'Done を隠す':'Done を表示';renderList();});document.getElementById('view-kanban').addEventListener('click',()=>{currentView='kanban';renderView();});document.getElementById('view-list').addEventListener('click',()=>{currentView='list';renderView();});document.querySelectorAll('th[data-col]').forEach(th=>th.addEventListener('click',()=>{const col=th.dataset.col;if(listSort.col===col){listSort.dir=listSort.dir==='asc'?'desc':'asc';}else{listSort={col,dir:'asc'};}renderList();}));
document.querySelectorAll('.add-task').forEach(button=>button.addEventListener('click',()=>{const inline=button.parentElement.querySelector('.inline-create');inline.classList.add('show');inline.querySelector('.ic-title').focus();}));document.querySelectorAll('.inline-create').forEach(inline=>{const status=inline.closest('.column').dataset.status;inline.querySelector('.ic-submit').addEventListener('click',()=>postCreate(inline,status));inline.querySelector('.ic-cancel').addEventListener('click',()=>resetInline(inline));});
document.querySelectorAll('.column').forEach(column=>{column.addEventListener('dragover',(event)=>{event.preventDefault();document.querySelectorAll('.column').forEach(c=>c.classList.remove('drag-over'));column.classList.add('drag-over');});column.addEventListener('dragleave',()=>column.classList.remove('drag-over'));column.addEventListener('drop',()=>{document.querySelectorAll('.column').forEach(c=>c.classList.remove('drag-over'));const dragging=document.querySelector('.task[data-dragging="true"]');if(!dragging)return;const task=tasks.find(t=>t.taskId===dragging.dataset.taskId);if(!task)return;const toStatus=column.dataset.status;if(task.status===toStatus)return;const {version,...taskWithoutVersion}=task;vscode.postMessage({type:'board:drop',task:{...taskWithoutVersion,expectedVersion:version},toStatus});task.status=toStatus;task.version+=1;render();});});window.addEventListener('message',(event)=>{if(event.data?.type==='board:init'){tasks=event.data.tasks??[];if(!projectId){projectId=tasks[0]?.projectId??null;}render();renderView();}});
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
