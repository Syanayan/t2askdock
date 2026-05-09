import { describe, expect, it, vi } from 'vitest';
import { TaskDetailWebviewPanel } from '../../src/ui/webview/task-detail-webview-panel.js';

const detail = { taskId:'t1', projectId:'p1', title:'Task', status:'todo', priority:'medium', dueDate:null, tags:[], description:null, assignee:null, parentTaskId:null, version:1, progress:0, isClosed:false, isArchived:false, closeReason:null };

describe('TaskDetailWebviewPanel', () => {
  it('renders layout and theme vars', async () => {
    const panel = new TaskDetailWebviewPanel(async()=>detail as never, async()=>[], async()=>[], {execute:vi.fn()} as never, {execute:vi.fn()} as never, {execute:vi.fn()} as never, async()=>undefined, { execute: vi.fn() } as never);
    const webview: any = { html:'', onDidReceiveMessage:vi.fn(()=>({dispose(){}})), postMessage: vi.fn() };
    await panel.render({ title:'', webview, dispose: vi.fn() } as never, 't1');
    expect(webview.html).toContain('detail-layout');
    expect(webview.html).toContain('detail-main');
    expect(webview.html).toContain('detail-side');
    expect(webview.html).toContain('--vscode-editor-background');
  });

  it('handles update messages', async () => {
    const updateTaskUseCase = { execute: vi.fn() };
    const moveTaskStatusUseCase = { execute: vi.fn() };
    const addCommentUseCase = { execute: vi.fn() };
    const handlerRef: { current?: (message: unknown) => Promise<void> } = {};
    const dispose = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const panel = new TaskDetailWebviewPanel(async(id)=>({...detail, taskId:id}) as never, async()=>[], async()=>[], updateTaskUseCase as never, moveTaskStatusUseCase as never, addCommentUseCase as never, executeCommand, { execute: vi.fn() } as never);
    const webview: any = { html:'', onDidReceiveMessage:(h:any)=>{handlerRef.current=h; return {dispose(){}};}, postMessage: vi.fn() };
    await panel.render({ title:'', webview, dispose } as never, 't1');
    await handlerRef.current?.({ type:'detail:subtask:toggle', taskId:'s1', newStatus:'done' });
    await handlerRef.current?.({ type:'detail:save', title:'x' });
    await handlerRef.current?.({ type:'detail:comment:add', body:'hello' });
    await handlerRef.current?.({ type:'detail:file:open', path:'file:///tmp/demo.txt' });
    await handlerRef.current?.({ type:'detail:closeTask', reason:'duplicate' });
    await handlerRef.current?.({ type:'detail:archiveTask' });
    await handlerRef.current?.({ type:'detail:close' });
    expect(moveTaskStatusUseCase.execute).toHaveBeenCalled();
    expect(updateTaskUseCase.execute).toHaveBeenCalled();
    expect(addCommentUseCase.execute).toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('vscode.open', expect.objectContaining({ scheme: 'file', fsPath: '/tmp/demo.txt' }));
    expect(updateTaskUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ isClosed: true, closeReason: 'duplicate' }));
    expect(dispose).toHaveBeenCalled();
  });

  it('renders create mode', async () => {
    const panel = new TaskDetailWebviewPanel(async()=>null as never, async()=>[], async()=>[], {execute:vi.fn()} as never, {execute:vi.fn()} as never, {execute:vi.fn()} as never, async()=>undefined, { execute: vi.fn().mockResolvedValue({ id: 'new-1' }) } as never);
    const webview: any = { html:'', onDidReceiveMessage:vi.fn(()=>({dispose(){}})), postMessage: vi.fn() };
    await panel.render({ title:'', webview, dispose: vi.fn() } as never);
    expect(webview.html).toContain('Create Task');
    expect(webview.html).toContain("type:'detail:create'");
    expect(webview.html).toContain('btn-save');
    expect(webview.html).toContain('disabled');
    expect(webview.html).toContain('titleEl.value.trim().length>0');
    expect(webview.html).toContain("if((e.ctrlKey||e.metaKey)&&e.key==='Enter')");
  });
});
