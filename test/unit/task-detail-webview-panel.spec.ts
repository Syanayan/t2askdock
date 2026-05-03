import { describe, expect, it, vi } from 'vitest';
import { TaskDetailWebviewPanel } from '../../src/ui/webview/task-detail-webview-panel.js';

const detail = { taskId:'t1', projectId:'p1', title:'Task', status:'todo', priority:'medium', dueDate:null, tags:[], description:null, assignee:null, parentTaskId:null, version:1, progress:0 };

describe('TaskDetailWebviewPanel', () => {
  it('renders layout and theme vars', async () => {
    const handlerRef: { current?: (message: unknown) => Promise<void> } = {};
    const panel = new TaskDetailWebviewPanel(async()=>detail as never, async()=>[], async()=>[], {execute:vi.fn()} as never, {execute:vi.fn()} as never, {execute:vi.fn()} as never, async()=>undefined);
    const webview: any = { html:'', onDidReceiveMessage:(h:any)=>{handlerRef.current=h; return {dispose(){}};}, postMessage: vi.fn() };
    await panel.render({ title:'', webview, dispose: vi.fn() } as never, 't1');
    expect(webview.html).toContain('detail-layout');
    expect(webview.html).toContain('detail-main');
    expect(webview.html).toContain('detail-side');
    expect(webview.html).toContain('--vscode-editor-background');
  });

  it('handles messages', async () => {
    const updateTaskUseCase = { execute: vi.fn() };
    const moveTaskStatusUseCase = { execute: vi.fn() };
    const addCommentUseCase = { execute: vi.fn() };
    const handlerRef: { current?: (message: unknown) => Promise<void> } = {};
    const dispose = vi.fn();
    const panel = new TaskDetailWebviewPanel(async(id)=>({...detail, taskId:id}) as never, async()=>[], async()=>[], updateTaskUseCase as never, moveTaskStatusUseCase as never, addCommentUseCase as never, async()=>undefined);
    const webview: any = { html:'', onDidReceiveMessage:(h:any)=>{handlerRef.current=h; return {dispose(){}};}, postMessage: vi.fn() };
    await panel.render({ title:'', webview, dispose } as never, 't1');
    await handlerRef.current?.({ type:'detail:subtask:toggle', taskId:'s1', newStatus:'done' });
    await handlerRef.current?.({ type:'detail:save', title:'x' });
    await handlerRef.current?.({ type:'detail:comment:add', body:'hello' });
    await handlerRef.current?.({ type:'detail:close' });
    expect(moveTaskStatusUseCase.execute).toHaveBeenCalled();
    expect(updateTaskUseCase.execute).toHaveBeenCalled();
    expect(addCommentUseCase.execute).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
  });
});
