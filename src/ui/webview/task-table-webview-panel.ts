import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UpdateTaskUseCase } from '../../core/usecase/update-task-usecase.js';
import type { TaskDetail, TaskTreeNode } from '../../core/ports/repositories/task-repository.js';
import type * as vscode from 'vscode';

type TableTaskNode = TaskTreeNode & { projectId: string; projectName?: string };

export class TaskTableWebviewPanel {
  public static readonly VIEW_TYPE = 'taskDock.tableView';

  public constructor(
    private readonly moveTaskStatusUseCase: Pick<MoveTaskStatusUseCase, 'execute'>,
    private readonly updateTaskUseCase: Pick<UpdateTaskUseCase, 'execute'>,
    private readonly loadTree: () => Promise<TableTaskNode[]>,
    private readonly findTaskDetailById: (taskId: string) => Promise<TaskDetail | null>,
    private readonly openTaskDetail: (taskId: string) => Promise<void>,
    private readonly openProject?: (projectId: string, projectName?: string) => Promise<void>,
    private readonly unmountDatabase?: () => Promise<void>,
    private readonly panelTitle?: string,
    private readonly enableArchiveControls: boolean = true
  ) {}

  public async render(panel: { title: string; webview: Pick<vscode.Webview, 'html' | 'postMessage' | 'onDidReceiveMessage'> }): Promise<void> {
    panel.webview.html = this.buildHtml();
    panel.webview.onDidReceiveMessage?.(async (message: unknown) => {
      if (isOpenTaskMessage(message)) {
        await this.openTaskDetail(message.taskId);
      }
      if (isOpenProjectMessage(message) && this.openProject) {
        await this.openProject(message.projectId, message.projectName);
      }
      if (isUnmountDatabaseMessage(message) && this.unmountDatabase) {
        await this.unmountDatabase();
      }
      if (isMoveStatusMessage(message)) {
        await this.moveStatus(message.taskId, message.toStatus, message.expectedVersion);
        await this.postTasks(panel.webview);
      }
      if (isUpdateProgressMessage(message)) {
        await this.updateProgress(message.taskId, message.progress, message.expectedVersion);
        await this.postTasks(panel.webview);
      }
      if (isArchiveTasksMessage(message)) {
        await this.archiveTasks(message.taskIds);
        await this.postTasks(panel.webview);
      }
      if (isAddTaskMessage(message)) {
        await this.openTaskDetail('');
      }
    });
    await this.postTasks(panel.webview);
  }

  public renderDisconnected(panel: { title: string; webview: Pick<vscode.Webview, 'html'> }): void {
    panel.webview.html = `<!DOCTYPE html><html lang="ja"><body style="font-family:sans-serif;padding:16px;">DB未接続です。DBを選択して再度開いてください。</body></html>`;
  }

  private async postTasks(webview: Pick<vscode.Webview, 'postMessage'>): Promise<void> {
    const tasks = this.withCalculatedProgress(await this.loadTree());
    await webview.postMessage?.({ type: 'table:init', tasks, title: this.panelTitle });
  }

  private withCalculatedProgress(nodes: TableTaskNode[]): TableTaskNode[] {
    const walk = (node: TableTaskNode): TableTaskNode => {
      const children = node.children.map(child => walk({ ...child, projectId: node.projectId }));
      if (children.length === 0) {
        return { ...node, children };
      }
      const doneCount = children.filter(child => child.status === 'done').length;
      const progress = Math.round((doneCount / children.length) * 100);
      return { ...node, progress, children };
    };
    return nodes.map(walk);
  }

  private async moveStatus(taskId: string, toStatus: TaskStatus, expectedVersion: number): Promise<void> {
    const detail = await this.findTaskDetailById(taskId);
    if (!detail) {
      return;
    }
    await this.moveTaskStatusUseCase.execute({
      taskId: detail.taskId,
      projectId: detail.projectId,
      actorId: 'system',
      title: detail.title,
      description: detail.description,
      priority: detail.priority,
      assignee: detail.assignee,
      dueDate: detail.dueDate,
      tags: detail.tags,
      parentTaskId: detail.parentTaskId,
      expectedVersion,
      now: new Date().toISOString(),
      toStatus
    });
  }

  private async updateProgress(taskId: string, progress: number, expectedVersion: number): Promise<void> {
    const detail = await this.findTaskDetailById(taskId);
    if (!detail) {
      return;
    }
    await this.updateTaskUseCase.execute({
      taskId: detail.taskId,
      projectId: detail.projectId,
      actorId: 'system',
      title: detail.title,
      description: detail.description,
      status: detail.status,
      priority: detail.priority,
      assignee: detail.assignee,
      dueDate: detail.dueDate,
      tags: detail.tags,
      parentTaskId: detail.parentTaskId,
      expectedVersion,
      now: new Date().toISOString(),
      progress
    });
  }


  private async archiveTasks(taskIds: string[]): Promise<void> {
    for (const taskId of taskIds) {
      const detail = await this.findTaskDetailById(taskId);
      if (!detail) continue;
      if (!(detail.status === 'done' || detail.isClosed)) continue;
      await this.updateTaskUseCase.execute({
        taskId: detail.taskId,
        projectId: detail.projectId,
        actorId: 'system',
        title: detail.title,
        description: detail.description,
        status: detail.status,
        priority: detail.priority,
        assignee: detail.assignee,
        dueDate: detail.dueDate,
        tags: detail.tags,
        parentTaskId: detail.parentTaskId,
        expectedVersion: detail.version,
        now: new Date().toISOString(),
        progress: detail.progress,
        isClosed: detail.isClosed,
        closeReason: detail.closeReason,
        isArchived: true
      });
    }
  }

  private buildHtml(): string {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><style>
      body{font-family:sans-serif;margin:16px}.container{margin-top:8px}
      .header{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .header-actions{display:flex;align-items:center;gap:8px}
      .btn{border:1px solid var(--vscode-panel-border);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:4px 10px;border-radius:6px;cursor:pointer}
      .btn.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
      .task-title{cursor:pointer}.status-badge{padding:2px 8px;border-radius:999px;color:#fff;font-size:12px}
      .status-todo{background:#666}.status-in_progress{background:#2979ff}.status-done{background:#2e7d32}.status-blocked{background:#d32f2f}.status-close{background:#7b1fa2}.status-archived{background:#455a64}.tabs{display:flex;gap:8px;margin:8px 0}.tab{padding:4px 10px;border:1px solid #bbb;border-radius:999px;cursor:pointer}.tab.active{background:#333;color:#fff}
      .tree-toggle{cursor:pointer;display:inline-block;width:20px}.indent{display:inline-block} tr.selected{background:color-mix(in srgb,var(--vscode-list-activeSelectionBackground) 65%, transparent)}
    </style></head><body><div class="header"><h2 id="panel-title"></h2><div class="header-actions"><button id="btn-archive-selected" class="btn secondary" type="button" style="display:none">Archive</button><button id="btn-add-task" class="btn" type="button" style="display:none">AddTask</button><button id="btn-unmount-db" class="btn secondary" type="button" style="display:none">DBをアンマウント</button></div></div><div class="tabs"><button class="tab active" data-tab="task">Tasks</button><button class="tab" data-tab="done">Done</button><button class="tab" data-tab="close">Close</button><button class="tab" data-tab="archived">Archive</button></div><div class="container"><table><thead><tr><th>タイトル</th><th>ステータス</th><th>担当者</th><th>優先度</th><th>進捗</th></tr></thead><tbody id="rows"></tbody></table></div>
    <script>
    const vscode = acquireVsCodeApi();
    let roots=[]; let currentTab="task"; const expanded=new Set(); const collapsedProjects=new Set(); const clickTimers={};
    const effectiveStatus=(n)=>n.isArchived?'archived':(n.isClosed?'close':n.status);
    const badge=(s)=>'<span class="status-badge status-'+s+'">'+s+'</span>';
    const matchTab=(n)=>{const s=effectiveStatus(n);if(currentTab==='task')return s==='todo'||s==='in_progress'||s==='blocked';return s===currentTab;};
    const render=()=>{const rows=document.getElementById('rows');rows.innerHTML='';
      const walk=(nodes,depth)=>nodes.forEach(n=>{if(n.taskId?.startsWith('__empty__'))return; const hasChildren=(n.children||[]).length>0; const open=expanded.has(n.taskId);
        if(!matchTab(n)) return; const tr=document.createElement('tr');
        tr.dataset.taskId=n.taskId; tr.dataset.projectId=n.projectId||'';
        tr.innerHTML='<td><span class="indent" style="width:'+(depth*16)+'px"></span><span class="tree-toggle" data-id="'+n.taskId+'">'+(hasChildren?(open?'▼':'▶'):'')+'</span><span class="task-title" data-open="'+n.taskId+'">'+n.title+'</span></td'+
        '<td>'+badge(effectiveStatus(n))+'</td>'+
        '<td>'+(n.assignee??'-')+'</td><td>'+n.priority+'</td><td>'+n.progress+'%</td>'; 
        rows.appendChild(tr);
        if(hasChildren&&open) walk(n.children, depth+1);
      });
      const byProject={};const pidOrder=[];const pnames={};
      roots.forEach(n=>{const pid=n.projectId||'';if(!(pid in pnames)){pidOrder.push(pid);pnames[pid]=n.projectName||pid;byProject[pid]=[];}byProject[pid].push(n);});
      pidOrder.forEach(pid=>{
        const isOpen=!collapsedProjects.has(pid);
        const htr=document.createElement('tr');
        htr.innerHTML='<td colspan="5" style="padding:3px 8px;font-size:13px;color:var(--vscode-foreground);border-top:1px solid var(--vscode-panel-border);background:var(--vscode-list-inactiveSelectionBackground);cursor:pointer;user-select:none"><span style="display:inline-block;width:14px;font-size:11px;opacity:.7">'+(isOpen?'▼':'▶')+'</span> '+pnames[pid]+'</td>';
        htr.addEventListener('click',()=>{if(clickTimers[pid]){clearTimeout(clickTimers[pid]);delete clickTimers[pid];vscode.postMessage({type:'table:openProject',projectId:pid,projectName:pnames[pid]});}else{clickTimers[pid]=setTimeout(()=>{delete clickTimers[pid];collapsedProjects.has(pid)?collapsedProjects.delete(pid):collapsedProjects.add(pid);document.getElementById('panel-title').textContent=pnames[pid];render();},250);}});
        rows.appendChild(htr);
        if(isOpen)walk(byProject[pid],0);
      });
      rows.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{const id=el.dataset.id; expanded.has(id)?expanded.delete(id):expanded.add(id); render();});
      rows.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'table:openTask',taskId:el.dataset.open}));
      rows.querySelectorAll('tr[data-task-id]').forEach((row)=>row.addEventListener('click',(e)=>{const id=row.dataset.taskId;const ids=Array.from(rows.querySelectorAll('tr[data-task-id]')).map(r=>r.dataset.taskId);if(e.shiftKey&&anchorTaskId&&ids.includes(anchorTaskId)){const a=ids.indexOf(anchorTaskId),b=ids.indexOf(id);const [s,e2]=a<b?[a,b]:[b,a];selectedTaskIds=[...new Set([...selectedTaskIds,...ids.slice(s,e2+1)])];}else if(e.ctrlKey||e.metaKey){selectedTaskIds=selectedTaskIds.includes(id)?selectedTaskIds.filter(v=>v!==id):[...selectedTaskIds,id];anchorTaskId=id;}else{selectedTaskIds=[id];anchorTaskId=id;}applySelection();}));
      applySelection();
    };
    const archiveBtn=document.getElementById('btn-archive-selected');
    const addTaskBtn=document.getElementById('btn-add-task');
    let selectedTaskIds=[]; let anchorTaskId=null;
    const rowMap=()=>Object.fromEntries(Array.from(document.querySelectorAll('#rows tr[data-task-id]')).map(r=>[r.dataset.taskId,r]));
    const applySelection=()=>{const map=rowMap();Object.values(map).forEach(r=>r.classList.remove('selected'));selectedTaskIds.forEach(id=>map[id]?.classList.add('selected'));const controlsEnabled=${this.enableArchiveControls ? 'true' : 'false'};const visibleStatus=controlsEnabled&&['done','close'].includes(currentTab);if(archiveBtn)archiveBtn.style.display=visibleStatus?'inline-block':'none';if(addTaskBtn)addTaskBtn.style.display=controlsEnabled?'inline-block':'none';};
    const collectArchivable=()=>selectedTaskIds.filter(id=>{const row=rowMap()[id];if(!row)return false;const st=(row.children[1]?.innerText||'').trim();return st==='done'||st==='close';});
    if(addTaskBtn){addTaskBtn.addEventListener('click',()=>{const row=selectedTaskIds.length?rowMap()[selectedTaskIds[0]]:null;vscode.postMessage({type:'table:addTask',projectId:row?.dataset.projectId});});}
    if(archiveBtn){archiveBtn.addEventListener('click',()=>{const taskIds=collectArchivable();if(taskIds.length===0)return; if(!confirm('選択したタスクをArchiveしますか？'))return; vscode.postMessage({type:'table:archiveTasks',taskIds});});}
    const unmountBtn=document.getElementById('btn-unmount-db');
    if(unmountBtn){const canUnmount=${this.unmountDatabase ? 'true' : 'false'};if(canUnmount){unmountBtn.style.display='inline-block';unmountBtn.addEventListener('click',()=>vscode.postMessage({type:'table:unmountDatabase'}));}}
    window.addEventListener('message',(event)=>{if(event.data?.type==='table:init'){roots=event.data.tasks??[]; document.getElementById('panel-title').textContent=event.data.title??'Task Table'; render();}});document.querySelectorAll('.tab').forEach(el=>el.onclick=()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');currentTab=el.dataset.tab;render();});
    </script></body></html>`;
  }
}

function isOpenTaskMessage(value: unknown): value is { type: 'table:openTask'; taskId: string } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:openTask' && typeof c.taskId === 'string';
}

function isOpenProjectMessage(value: unknown): value is { type: 'table:openProject'; projectId: string; projectName?: string } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:openProject' && typeof c.projectId === 'string';
}

function isMoveStatusMessage(value: unknown): value is { type: 'table:moveStatus'; taskId: string; toStatus: TaskStatus; expectedVersion: number } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:moveStatus' && typeof c.taskId === 'string' && typeof c.toStatus === 'string' && typeof c.expectedVersion === 'number';
}

function isUpdateProgressMessage(value: unknown): value is { type: 'table:updateProgress'; taskId: string; progress: number; expectedVersion: number } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:updateProgress' && typeof c.taskId === 'string' && typeof c.progress === 'number' && typeof c.expectedVersion === 'number';
}

function isUnmountDatabaseMessage(value: unknown): value is { type: 'table:unmountDatabase' } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:unmountDatabase';
}

function isArchiveTasksMessage(value: unknown): value is { type: 'table:archiveTasks'; taskIds: string[] } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:archiveTasks' && Array.isArray(c.taskIds) && c.taskIds.every((id) => typeof id === 'string');
}

function isAddTaskMessage(value: unknown): value is { type: 'table:addTask'; projectId?: string } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:addTask';
}
