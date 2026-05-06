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
    private readonly panelTitle?: string
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
      if (isMoveStatusMessage(message)) {
        await this.moveStatus(message.taskId, message.toStatus, message.expectedVersion);
        await this.postTasks(panel.webview);
      }
      if (isUpdateProgressMessage(message)) {
        await this.updateProgress(message.taskId, message.progress, message.expectedVersion);
        await this.postTasks(panel.webview);
      }
    });
    await this.postTasks(panel.webview);
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

  private buildHtml(): string {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><style>
      body{font-family:sans-serif;margin:16px}.container{margin-top:8px}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
      .task-title{cursor:pointer}.status-badge{padding:2px 8px;border-radius:999px;color:#fff;font-size:12px}
      .status-todo{background:#666}.status-in_progress{background:#2979ff}.status-done{background:#2e7d32}.status-blocked{background:#d32f2f}
      .tree-toggle{cursor:pointer;display:inline-block;width:20px}.indent{display:inline-block}
    </style></head><body><h2 id="panel-title"></h2><div class="container"><table><thead><tr><th>タイトル</th><th>ステータス</th><th>担当者</th><th>優先度</th><th>進捗</th></tr></thead><tbody id="rows"></tbody></table></div>
    <script>
    const vscode = acquireVsCodeApi();
    let roots=[]; const expanded=new Set(); const collapsedProjects=new Set(); const clickTimers={};
    const badge=(s)=>'<span class="status-badge status-'+s+'">'+s+'</span>';
    const render=()=>{const rows=document.getElementById('rows');rows.innerHTML='';
      const walk=(nodes,depth)=>nodes.forEach(n=>{if(n.taskId?.startsWith('__empty__'))return; const hasChildren=(n.children||[]).length>0; const open=expanded.has(n.taskId);
        const tr=document.createElement('tr');
        tr.innerHTML='<td><span class="indent" style="width:'+(depth*16)+'px"></span><span class="tree-toggle" data-id="'+n.taskId+'">'+(hasChildren?(open?'▼':'▶'):'')+'</span><span class="task-title" data-open="'+n.taskId+'">'+n.title+'</span></td>'+
        '<td>'+badge(n.status)+'</td>'+
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
    };
    window.addEventListener('message',(event)=>{if(event.data?.type==='table:init'){roots=event.data.tasks??[]; document.getElementById('panel-title').textContent=event.data.title??'Task Table'; render();}});
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
