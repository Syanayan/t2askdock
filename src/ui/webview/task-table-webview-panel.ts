import type { TaskStatus } from '../../core/domain/entities/task.js';
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
    private readonly createTask?: (projectId?: string) => Promise<void>,
    private readonly openProject?: (projectId: string, projectName?: string) => Promise<void>,
    private readonly unmountDatabase?: () => Promise<void>,
    private readonly panelTitle?: string,
    private readonly enableArchiveControls: boolean = true,
    private readonly confirmArchive?: (count: number) => Promise<boolean>,
    private readonly addCategory?: () => Promise<void>,
    private readonly renameCategory?: (projectId: string) => Promise<void>,
    private readonly onCategoryChanged?: () => void,
    private readonly projectId?: string,
    private readonly archiveCategory?: (projectId: string) => Promise<void>
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
        const ok = this.confirmArchive ? await this.confirmArchive(message.taskIds.length) : true;
        if (!ok) return;
        await this.archiveTasks(message.taskIds);
        await this.postTasks(panel.webview);
      }
      if (isAddTaskMessage(message)) {
        await this.createTask?.(message.projectId);
        await this.postTasks(panel.webview);
      }
      if (isAddCategoryRequestMessage(message) && this.addCategory) {
        await this.addCategory();
        this.onCategoryChanged?.();
        await this.postTasks(panel.webview);
      }
      if (isRenameCategoryRequestMessage(message) && this.renameCategory) {
        await this.renameCategory(message.projectId);
        this.onCategoryChanged?.();
        await this.postTasks(panel.webview);
      }
      if (isArchiveCategoryRequestMessage(message) && this.archiveCategory) {
        await this.archiveCategory(message.projectId);
      }
      if (isReadyMessage(message) || isRefreshMessage(message)) {
        await this.postTasks(panel.webview);
      }
    });
  }

  public async refresh(webview: Pick<vscode.Webview, 'postMessage'>): Promise<void> {
    await this.postTasks(webview);
  }

  public renderDisconnected(panel: { title: string; webview: Pick<vscode.Webview, 'html'> }): void {
    panel.webview.html = `<!DOCTYPE html><html lang="ja"><body style="font-family:sans-serif;padding:16px;">DB未接続です。DBを選択して再度開いてください。</body></html>`;
  }

  private async postTasks(webview: Pick<vscode.Webview, 'postMessage'>): Promise<void> {
    const tasks = this.withCalculatedProgress(await this.loadTree());
    const title = tasks.find(t => t.projectName)?.projectName ?? this.panelTitle;
    await webview.postMessage?.({ type: 'table:init', tasks, title });
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
    const singleProject = !!this.projectId;
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><style>
    *{box-sizing:border-box}
    body{font-family:var(--vscode-font-family,sans-serif);margin:0;padding:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}
    .app-header{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--vscode-panel-border);flex-wrap:wrap;gap:8px}
    .app-title{font-size:18px;font-weight:700;flex-shrink:0;white-space:nowrap}
    .search-wrap{flex:1;max-width:260px;position:relative;min-width:120px}
    .search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:.4;font-size:14px;pointer-events:none}
    .search-input{width:100%;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:999px;padding:5px 12px 5px 30px;color:var(--vscode-input-foreground);outline:none;font-size:13px}
    .header-right{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .btn{cursor:pointer;border:1px solid var(--vscode-panel-border);border-radius:8px;padding:5px 12px;font-size:12px;background:transparent;color:var(--vscode-editor-foreground);font-family:inherit}
    .btn:hover{background:var(--vscode-list-hoverBackground)}
    .btn:disabled{opacity:.4;cursor:not-allowed}
    .btn-primary{background:#0ea5e9;color:#fff;border-color:transparent;font-weight:600}
    .btn-primary:hover{background:#0284c7}
    .tabs-bar{display:flex;align-items:center;padding:10px 20px;gap:4px;border-bottom:1px solid var(--vscode-panel-border)}
    .tab{padding:5px 16px;border-radius:999px;border:none;background:transparent;color:var(--vscode-editor-foreground);cursor:pointer;font-size:13px;opacity:.55;font-family:inherit}
    .tab.active{background:#0ea5e9;color:#fff;opacity:1}
    .tab:hover:not(.active){opacity:.85;background:var(--vscode-list-hoverBackground)}
    .table-wrap{margin:16px 20px 20px;border-radius:10px;border:1px solid var(--vscode-panel-border);overflow:hidden;background:var(--vscode-sideBar-background)}
    table{width:100%;border-collapse:collapse}
    thead th{padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.45;border-bottom:1px solid var(--vscode-panel-border);text-align:left;white-space:nowrap}
    tbody tr{border-bottom:1px solid var(--vscode-panel-border)}
    tbody tr:last-child{border-bottom:none}
    tbody td{padding:11px 14px;vertical-align:middle;font-size:13px}
    tbody tr:hover td{background:var(--vscode-list-hoverBackground)}
    tbody tr.selected td{background:color-mix(in srgb,#0ea5e9 10%,transparent)}
    .sb{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;border:1px solid;white-space:nowrap;letter-spacing:.02em}
    .sb-todo{background:rgba(59,130,246,.1);color:#93c5fd;border-color:rgba(59,130,246,.25)}
    .sb-in_progress{background:rgba(245,158,11,.1);color:#fcd34d;border-color:rgba(245,158,11,.25)}
    .sb-done{background:rgba(34,197,94,.1);color:#86efac;border-color:rgba(34,197,94,.25)}
    .sb-close{background:rgba(251,146,60,.1);color:#fdba74;border-color:rgba(251,146,60,.25)}
    .sb-review{background:rgba(139,92,246,.1);color:#c4b5fd;border-color:rgba(139,92,246,.25)}
    .sb-archived{background:rgba(156,163,175,.08);color:rgba(156,163,175,.7);border-color:rgba(156,163,175,.2)}
    .pb{display:inline-block;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;border:1px solid;white-space:nowrap}
    .pb-critical{background:rgba(239,68,68,.12);color:#f87171;border-color:rgba(239,68,68,.25)}
    .pb-high{background:rgba(249,115,22,.12);color:#fb923c;border-color:rgba(249,115,22,.25)}
    .pb-medium{background:rgba(234,179,8,.12);color:#facc15;border-color:rgba(234,179,8,.25)}
    .pb-low{background:rgba(34,197,94,.12);color:#4ade80;border-color:rgba(34,197,94,.25)}
    .avatar{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
    .prog-wrap{display:flex;flex-direction:column;gap:3px;min-width:70px}
    .prog-pct{font-size:11px;font-weight:600;opacity:.75}
    .prog-bar{height:4px;border-radius:2px;background:color-mix(in srgb,var(--vscode-editor-foreground) 10%,transparent);overflow:hidden}
    .prog-fill{height:100%;border-radius:2px}
    .task-link{font-weight:500}
    .tree-toggle{cursor:pointer;font-size:11px;opacity:.5;flex-shrink:0;width:14px;text-align:center}
    .tree-toggle:hover{opacity:1}
    .cat-row td{background:color-mix(in srgb,var(--vscode-editor-foreground) 5%,transparent);font-weight:600;font-size:13px;cursor:pointer;user-select:none;padding:8px 14px;border-bottom:1px solid var(--vscode-panel-border)}
    .cat-arrow{display:inline-block;width:16px;font-size:10px;opacity:.5;margin-right:2px}
    .table-footer{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid var(--vscode-panel-border);font-size:12px;opacity:.55;flex-wrap:wrap;gap:6px}
    .footer-stat{display:inline-flex;align-items:center;gap:4px;margin-left:10px}
    .stat-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
    </style></head>
    <body>
    <header class="app-header">
      <span class="app-title" id="panel-title">...</span>
      <div class="search-wrap"><span class="search-icon">⌕</span><input class="search-input" id="search-input" placeholder="検索..." type="text"/></div>
      <div class="header-right">
        ${singleProject ? '<button id="btn-rename" class="btn" type="button">Rename</button>' : ''}
        ${singleProject && this.openProject ? '<button id="btn-open-board" class="btn" type="button">Board</button>' : ''}
        <button id="btn-refresh" class="btn" type="button" title="Refresh">↺</button>
        <button id="btn-archive-selected" class="btn" type="button" style="display:none">Archive</button>
        <button id="btn-add-task" class="btn btn-primary" type="button" style="display:none">+ Add Task</button>
        ${singleProject && this.archiveCategory ? '<button id="btn-archive-category" class="btn" type="button" disabled>Archive Category</button>' : ''}
      </div>
    </header>
    <div class="tabs-bar">
      <button class="tab active" data-tab="task">Tasks</button>
      <button class="tab" data-tab="done">Done</button>
      <button class="tab" data-tab="close">Close</button>
      <button class="tab" data-tab="archived">Archive</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Title</th><th>Status</th><th>Assignee</th><th>Priority</th><th>Progress</th><th>Actions</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="table-footer"><span id="footer-count"></span><span id="footer-stats"></span></div>
    </div>
    <script>
    const vscode = acquireVsCodeApi();
    const singleProject = ${singleProject};
    let roots=[]; let currentTab='task'; const expanded=new Set(); const collapsedProjects=new Set(); const clickTimers={};
    let selectedTaskIds=[]; let anchorTaskId=null; let searchQuery='';
    const effectiveStatus=(n)=>n.isArchived?'archived':(n.isClosed?'close':n.status);
    const esc=(s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const statusMap={todo:['⊙','TODO','sb-todo'],in_progress:['●','PROGRESS','sb-in_progress'],done:['✓','DONE','sb-done'],close:['⊗','CLOSE','sb-close'],review:['◉','REVIEW','sb-review'],archived:['▪','ARCHIVED','sb-archived']};
    const statusBadge=(s)=>{const[ic,lb,cls]=statusMap[s]||['','unknown','sb-todo'];return'<span class="sb '+cls+'">'+ic+' '+lb+'</span>';};
    const avatarEl=(a)=>{if(!a)return'<span style="opacity:.3">—</span>';const ini=a.trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?';const hue=[...a].reduce((h,c)=>h+c.charCodeAt(0),0)%360;return'<div class="avatar" style="background:hsl('+hue+',55%,45%)">'+ini+'</div>';};
    const priBadge=(p)=>{const cls='pb-'+(p||'low');const lb=(p||'low').toUpperCase();return'<span class="pb '+cls+'">'+lb+'</span>';};
    const progBar=(pct)=>{const c=pct>=100?'#22c55e':pct>=60?'#0ea5e9':pct>=30?'#f59e0b':'#6b7280';return'<div class="prog-wrap"><div class="prog-pct">'+pct+'%</div><div class="prog-bar"><div class="prog-fill" style="width:'+pct+'%;background:'+c+'"></div></div></div>';};
    const matchTab=(n)=>{const s=effectiveStatus(n);if(currentTab==='task')return s==='todo'||s==='in_progress'||s==='review';return s===currentTab;};
    const matchSearch=(n)=>!searchQuery||esc(n.title).toLowerCase().includes(searchQuery.toLowerCase())||n.title.toLowerCase().includes(searchQuery.toLowerCase());
    const statColors={todo:'#93c5fd',in_progress:'#fcd34d',done:'#86efac',close:'#fdba74',blocked:'#fca5a5',archived:'#9ca3af'};
    const statLabels={todo:'Todo',in_progress:'Progress',done:'Done',close:'Close',blocked:'Blocked',archived:'Archived'};
    const flatAll=(nodes)=>nodes.flatMap(function flat(x){return[x,...(x.children||[]).flatMap(flat)];});
    const render=()=>{
      const rows=document.getElementById('rows'); rows.innerHTML='';
      let totalCount=0; const stats={};
      const walk=(nodes,depth)=>nodes.forEach(n=>{
        if(n.taskId?.startsWith('__empty__'))return;
        const hasChildren=(n.children||[]).length>0; const open=expanded.has(n.taskId);
        if(!matchTab(n)||!matchSearch(n)){if(hasChildren&&open)walk(n.children,depth+1);return;}
        totalCount++; const es=effectiveStatus(n); stats[es]=(stats[es]||0)+1;
        const tr=document.createElement('tr');
        if(selectedTaskIds.includes(n.taskId))tr.classList.add('selected');
        tr.dataset.taskId=n.taskId; tr.dataset.projectId=n.projectId||'';
        const padLeft=14+depth*16;
        const toggleHtml=hasChildren?'<span class="tree-toggle" data-id="'+n.taskId+'">'+(open?'▾':'▸')+'</span>':'';
        tr.innerHTML='<td style="display:flex;align-items:center;gap:4px;padding:11px 14px 11px '+padLeft+'px">'+toggleHtml+'<span class="task-link">'+esc(n.title)+'</span></td>'+
        '<td>'+statusBadge(es)+'</td>'+
        '<td>'+avatarEl(n.assignee)+'</td>'+
        '<td>'+priBadge(n.priority)+'</td>'+
        '<td>'+progBar(n.progress)+'</td>'+
        '<td></td>';
        rows.appendChild(tr);
        if(hasChildren&&open)walk(n.children,depth+1);
      });
      if(singleProject){
        walk(roots,0);
        const archiveCatBtn=document.getElementById('btn-archive-category');
        if(archiveCatBtn){const realTasks=flatAll(roots).filter(n=>!n.taskId?.startsWith('__empty__'));const canArchive=realTasks.length===0||realTasks.every(n=>n.isArchived||n.status==='done');archiveCatBtn.disabled=!canArchive;}
      }else{
        const byProject={}; const pidOrder=[]; const pnames={};
        roots.forEach(n=>{const pid=n.projectId||'';if(!(pid in pnames)){pidOrder.push(pid);pnames[pid]=n.projectName||pid;byProject[pid]=[];}byProject[pid].push(n);});
        pidOrder.forEach(pid=>{
          const isOpen=!collapsedProjects.has(pid);
          const htr=document.createElement('tr'); htr.className='cat-row';
          htr.innerHTML='<td colspan="6"><span class="cat-arrow">'+(isOpen?'▾':'▸')+'</span>'+esc(pnames[pid])+' <button data-rename-project="'+pid+'" class="btn" style="padding:1px 7px;font-size:11px">Rename</button></td>';
          htr.addEventListener('click',()=>{if(clickTimers[pid]){clearTimeout(clickTimers[pid]);delete clickTimers[pid];vscode.postMessage({type:'table:openProject',projectId:pid,projectName:pnames[pid]});}else{clickTimers[pid]=setTimeout(()=>{delete clickTimers[pid];collapsedProjects.has(pid)?collapsedProjects.delete(pid):collapsedProjects.add(pid);document.getElementById('panel-title').textContent=pnames[pid];render();},250);}});
          rows.appendChild(htr);
          if(isOpen)walk(byProject[pid],0);
        });
        rows.querySelectorAll('[data-rename-project]').forEach(el=>el.addEventListener('click',(ev)=>{ev.stopPropagation();vscode.postMessage({type:'table:renameCategoryRequest',projectId:el.dataset.renameProject});}));
      }
      rows.querySelectorAll('[data-id]').forEach(el=>{el.onclick=(e)=>{e.stopPropagation();const id=el.dataset.id;expanded.has(id)?expanded.delete(id):expanded.add(id);render();};el.ondblclick=(e)=>e.stopPropagation();});
      rows.querySelectorAll('tr[data-task-id]').forEach(row=>{row.addEventListener('click',(e)=>{const id=row.dataset.taskId;const ids=Array.from(rows.querySelectorAll('tr[data-task-id]')).map(r=>r.dataset.taskId);if(e.shiftKey&&anchorTaskId&&ids.includes(anchorTaskId)){const a=ids.indexOf(anchorTaskId),b=ids.indexOf(id);const[s,e2]=a<b?[a,b]:[b,a];selectedTaskIds=[...new Set([...selectedTaskIds,...ids.slice(s,e2+1)])];}else if(e.ctrlKey||e.metaKey){selectedTaskIds=selectedTaskIds.includes(id)?selectedTaskIds.filter(v=>v!==id):[...selectedTaskIds,id];anchorTaskId=id;}else{selectedTaskIds=[id];anchorTaskId=id;}applySelection();});row.addEventListener('dblclick',()=>{vscode.postMessage({type:'table:openTask',taskId:row.dataset.taskId});});});
      applySelection();
      document.getElementById('footer-count').textContent='Showing '+totalCount+' total tasks';
      document.getElementById('footer-stats').innerHTML=Object.entries(stats).map(([k,v])=>'<span class="footer-stat"><span class="stat-dot" style="background:'+(statColors[k]||'#888')+'"></span>'+v+' '+(statLabels[k]||k)+'</span>').join('');
    };
    const rowMap=()=>Object.fromEntries(Array.from(document.querySelectorAll('#rows tr[data-task-id]')).map(r=>[r.dataset.taskId,r]));
    const applySelection=()=>{const map=rowMap();Object.values(map).forEach(r=>r.classList.remove('selected'));selectedTaskIds.forEach(id=>map[id]?.classList.add('selected'));const ctrl=${this.enableArchiveControls ? 'true' : 'false'};const vis=ctrl&&['done','close'].includes(currentTab);const archiveBtn=document.getElementById('btn-archive-selected');const addTaskBtn=document.getElementById('btn-add-task');if(archiveBtn){archiveBtn.style.display=vis?'inline-block':'none';archiveBtn.disabled=selectedTaskIds.length===0;}if(addTaskBtn)addTaskBtn.style.display=ctrl?'inline-block':'none';};
    const archiveBtn=document.getElementById('btn-archive-selected');
    const addTaskBtn=document.getElementById('btn-add-task');
    const collectArchivable=()=>selectedTaskIds.filter(id=>{const n=flatAll(roots).find(x=>x.taskId===id);if(!n)return false;const s=effectiveStatus(n);return s==='done'||s==='close';});
    if(addTaskBtn){addTaskBtn.addEventListener('click',()=>{const row=selectedTaskIds.length?rowMap()[selectedTaskIds[0]]:null;const fallback=(roots[0]?.projectId)||undefined;vscode.postMessage({type:'table:addTask',projectId:row?.dataset.projectId||fallback});});}
    if(archiveBtn){archiveBtn.addEventListener('click',()=>{const ids=collectArchivable();if(ids.length===0)return;vscode.postMessage({type:'table:archiveTasks',taskIds:ids});});}
    const renameBtn=document.getElementById('btn-rename');
    if(renameBtn){renameBtn.addEventListener('click',()=>{const pid=roots[0]?.projectId;if(pid)vscode.postMessage({type:'table:renameCategoryRequest',projectId:pid});});}
    const boardBtn=document.getElementById('btn-open-board');
    if(boardBtn){boardBtn.addEventListener('click',()=>{const pid=roots[0]?.projectId;const pname=roots.find(n=>n.projectName)?.projectName||'';if(pid)vscode.postMessage({type:'table:openProject',projectId:pid,projectName:pname});});}
    const archiveCatBtn=document.getElementById('btn-archive-category');
    if(archiveCatBtn){archiveCatBtn.addEventListener('click',()=>{if(archiveCatBtn.disabled)return;const pid=roots[0]?.projectId;if(pid)vscode.postMessage({type:'table:archiveCategoryRequest',projectId:pid});});}
    document.getElementById('btn-refresh').addEventListener('click',()=>vscode.postMessage({type:'table:refresh'}));
    document.getElementById('search-input').addEventListener('input',(e)=>{searchQuery=e.target.value;render();});
    document.querySelectorAll('.tab').forEach(el=>el.onclick=()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');currentTab=el.dataset.tab;render();});
    window.addEventListener('message',(event)=>{if(event.data?.type==='table:init'){roots=event.data.tasks??[];document.getElementById('panel-title').textContent=event.data.title??'Task Table';render();}});
    vscode.postMessage({type:'table:ready'});
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

function isAddCategoryRequestMessage(value: unknown): value is { type: 'table:addCategoryRequest' } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:addCategoryRequest';
}

function isRenameCategoryRequestMessage(value: unknown): value is { type: 'table:renameCategoryRequest'; projectId: string } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:renameCategoryRequest' && typeof c.projectId === 'string';
}

function isArchiveCategoryRequestMessage(value: unknown): value is { type: 'table:archiveCategoryRequest'; projectId: string } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:archiveCategoryRequest' && typeof c.projectId === 'string';
}


function isReadyMessage(value: unknown): value is { type: 'table:ready' } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:ready';
}

function isRefreshMessage(value: unknown): value is { type: 'table:refresh' } {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).type === 'table:refresh';
}
