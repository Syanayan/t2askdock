import type { Priority, TaskStatus } from '../../core/domain/entities/task.js';
import type { MoveTaskStatusUseCase } from '../../core/usecase/move-task-status-usecase.js';
import type { UpdateTaskUseCase } from '../../core/usecase/update-task-usecase.js';
import type { TaskDetail, TaskTreeNode } from '../../core/ports/repositories/task-repository.js';
import type * as vscode from 'vscode';

type TableTaskNode = TaskTreeNode & { projectId: string };

export class TaskTableWebviewPanel {
  public static readonly VIEW_TYPE = 'taskDock.tableView';

  public constructor(
    private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
    private readonly updateTaskUseCase: UpdateTaskUseCase,
    private readonly loadTree: () => Promise<TableTaskNode[]>,
    private readonly findTaskDetailById: (taskId: string) => Promise<TaskDetail | null>,
    private readonly openTaskDetail: (taskId: string) => Promise<void>
  ) {}

  public async render(panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>): Promise<void> {
    panel.title = 'Task Dock Table';
    panel.webview.html = this.buildHtml();
    panel.webview.onDidReceiveMessage?.(async (message: unknown) => {
      if (isOpenTaskMessage(message)) {
        await this.openTaskDetail(message.taskId);
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
    await webview.postMessage?.({ type: 'table:init', tasks });
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
      select{font-size:12px}
    </style></head><body><h2>Task Table</h2><div class="container"><table><thead><tr><th>タイトル</th><th>ステータス</th><th>担当者</th><th>優先度</th><th>進捗</th></tr></thead><tbody id="rows"></tbody></table></div>
    <script>
    const vscode = acquireVsCodeApi();
    let roots=[]; const expanded=new Set();
    const badge=(s)=>'<span class="status-badge status-'+s+'">'+s+'</span>';
    const render=()=>{const rows=document.getElementById('rows');rows.innerHTML='';
      const walk=(nodes,depth)=>nodes.forEach(n=>{const hasChildren=(n.children||[]).length>0; const open=expanded.has(n.taskId);
        const tr=document.createElement('tr');
        tr.innerHTML='<td><span class="indent" style="width:'+(depth*16)+'px"></span><span class="tree-toggle" data-id="'+n.taskId+'">'+(hasChildren?(open?'▼':'▶'):'')+'</span><span class="task-title" data-open="'+n.taskId+'">'+n.title+'</span></td>'+
        '<td><span>'+badge(n.status)+'</span> <select data-status="'+n.taskId+'" data-version="'+n.version+'"><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="done">Done</option><option value="blocked">Blocked</option></select></td>'+
        '<td>'+(n.assignee??'-')+'</td><td>'+n.priority+'</td><td><input type="number" min="0" max="100" data-progress="'+n.taskId+'" data-version="'+n.version+'" value="'+n.progress+'" style="width:64px"/>%</td>';
        tr.querySelector('select').value=n.status;
        rows.appendChild(tr);
        if(hasChildren&&open) walk(n.children, depth+1);
      });}; walk(roots,0);
      rows.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{const id=el.dataset.id; expanded.has(id)?expanded.delete(id):expanded.add(id); render();});
      rows.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'table:openTask',taskId:el.dataset.open}));
      rows.querySelectorAll('select[data-status]').forEach(el=>el.onchange=()=>vscode.postMessage({type:'table:moveStatus',taskId:el.dataset.status,toStatus:el.value,expectedVersion:Number(el.dataset.version)}));
      rows.querySelectorAll('input[data-progress]').forEach(el=>el.onchange=()=>vscode.postMessage({type:'table:updateProgress',taskId:el.dataset.progress,progress:Number(el.value),expectedVersion:Number(el.dataset.version)}));
    };
    window.addEventListener('message',(event)=>{if(event.data?.type==='table:init'){roots=event.data.tasks??[]; render();}});
    </script></body></html>`;
  }
}

function isOpenTaskMessage(value: unknown): value is { type: 'table:openTask'; taskId: string } {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'table:openTask' && typeof c.taskId === 'string';
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
