import { describe, expect, it, vi } from 'vitest';
import { INITIAL_MIGRATION_V1_SQL } from '../../src/infra/sqlite/migrations/initial-migration-v1.js';
import { MIGRATION_V2_SQL } from '../../src/infra/sqlite/migrations/initial-migration-v2.js';
import { MIGRATION_V3_SQL } from '../../src/infra/sqlite/migrations/initial-migration-v3.js';

vi.mock('vscode', () => ({
  commands: { registerCommand: vi.fn(), executeCommand: vi.fn() },
  EventEmitter: class<T> {
    public readonly event = vi.fn();
    public fire = vi.fn();
    public dispose = vi.fn();
  },
  window: {
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    createQuickPick: vi.fn(() => ({
      items: [],
      selectedItems: [],
      title: '',
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      onDidAccept: vi.fn(() => ({ dispose: vi.fn() })),
      onDidHide: vi.fn(() => ({ dispose: vi.fn() })),
      onDidTriggerItemButton: vi.fn(() => ({ dispose: vi.fn() }))
    })),
    registerTreeDataProvider: vi.fn(),
    createTreeView: vi.fn(() => ({ selection: [], dispose: vi.fn() })),
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
    createWebviewPanel: vi.fn(() => ({ webview: { html: '' }, title: '' }))
  },
  workspace: { fs: { createDirectory: vi.fn(), writeFile: vi.fn() }, getConfiguration: vi.fn(() => ({ get: vi.fn(() => 'system') })) },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
  TreeItem: class { constructor(public label: string, public collapsibleState: number) {} },
  ThemeIcon: class { constructor(public id: string) {} },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
    joinPath: (...parts: Array<{ fsPath: string } | string>) => ({ fsPath: parts.map((p) => (typeof p === 'string' ? p : p.fsPath)).join('/') })
  }
}));
vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    pragma: vi.fn(),
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 0 }))
    })),
    exec: vi.fn(),
    close: vi.fn()
  }))
}));

describe('extension bootstrapMigrations', () => {
  it('ensures storage directory, runs v1 migration, and registers client disposal', async () => {
    const { bootstrapMigrations } = await import('../../src/extension.js');
    const ensureDirectory = vi.fn().mockResolvedValue(undefined);
    const resolveDatabasePath = vi.fn().mockReturnValue('/tmp/taskdock.sqlite3');
    const migrate = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const createClient = vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
      exec: vi.fn(),
      close
    });
    const createMigrator = vi.fn().mockReturnValue({ migrate });

    const subscriptions: Array<{ dispose: () => void }> = [];

    await bootstrapMigrations(
      {
        globalStorageUri: { fsPath: '/tmp/taskdock' } as never,
        subscriptions
      },
      {
        ensureDirectory,
        resolveDatabasePath,
        createClient,
        createMigrator
      }
    );

    expect(ensureDirectory).toHaveBeenCalledWith('/tmp/taskdock');
    expect(resolveDatabasePath).toHaveBeenCalledWith('/tmp/taskdock');
    expect(createClient).toHaveBeenCalledWith('/tmp/taskdock.sqlite3');
    expect(migrate).toHaveBeenCalledWith([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }, { version: 2, statements: MIGRATION_V2_SQL }, { version: 3, statements: MIGRATION_V3_SQL }]);
    expect(subscriptions).toHaveLength(1);

    subscriptions[0].dispose();
    expect(close).toHaveBeenCalledOnce();
  });

  it('wires taskDock commands through TaskDockCommandRegistry', async () => {
    const { activate } = await import('../../src/extension.js');
    const vscode = await import('vscode');
    const registerCommand = vi.mocked(vscode.commands.registerCommand);
    const registerTreeDataProvider = vi.mocked(vscode.window.registerTreeDataProvider);
    const createTreeView = vi.mocked(vscode.window.createTreeView);
    const createStatusBarItem = vi.mocked(vscode.window.createStatusBarItem);
    const createWebviewPanel = vi.mocked(vscode.window.createWebviewPanel);
    registerCommand.mockReturnValue({ dispose: vi.fn() } as never);
    registerTreeDataProvider.mockReturnValue({ dispose: vi.fn() } as never);
    createTreeView.mockReturnValue({ selection: [], dispose: vi.fn() } as never);

    await activate({
      globalStorageUri: { fsPath: '/tmp/taskdock' },
      secrets: { get: vi.fn().mockResolvedValue(undefined), store: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined), onDidChange: vi.fn() },
      subscriptions: []
    } as never);

    expect(createTreeView).toHaveBeenCalledWith('taskDock.myRecentTasks', expect.objectContaining({
      treeDataProvider: expect.objectContaining({
        getChildren: expect.any(Function),
        getTreeItem: expect.any(Function)
      })
    }));
    expect(createTreeView).toHaveBeenCalledWith('taskDock.allProjects', expect.objectContaining({
      treeDataProvider: expect.objectContaining({
        getChildren: expect.any(Function),
        getTreeItem: expect.any(Function)
      })
    }));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.openTree', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.openBoard', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.selectDatabase', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.toggleReadOnly', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.mountDatabase', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.registerDatabaseDirectory', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.createDatabase', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.createTask', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.createTaskInDb', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.createTaskInProject', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.myRecentTasks.sortUpdated', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.myRecentTasks.sortPriority', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.myRecentTasks.sortDeadline', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.allProjects.sortUpdated', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.allProjects.sortPriority', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.allProjects.sortDeadline', expect.any(Function));
    expect(createStatusBarItem).toHaveBeenCalledTimes(3);
    expect(createWebviewPanel).not.toHaveBeenCalled();
  });
});
