import { describe, expect, it, vi } from 'vitest';
import { INITIAL_MIGRATION_V1_SQL } from '../../src/infra/sqlite/migrations/initial-migration-v1.js';

vi.mock('vscode', () => ({
  commands: { registerCommand: vi.fn(), executeCommand: vi.fn() },
  window: {
    showInformationMessage: vi.fn(),
    registerTreeDataProvider: vi.fn(),
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
    createWebviewPanel: vi.fn(() => ({ webview: { html: '' }, title: '' }))
  },
  workspace: { fs: { createDirectory: vi.fn() } },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
  TreeItem: class { constructor(public label: string, public collapsibleState: number) {} },
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
    expect(migrate).toHaveBeenCalledWith([{ version: 1, statements: INITIAL_MIGRATION_V1_SQL }]);
    expect(subscriptions).toHaveLength(1);

    subscriptions[0].dispose();
    expect(close).toHaveBeenCalledOnce();
  });

  it('wires taskDock commands through TaskDockCommandRegistry', async () => {
    const { activate } = await import('../../src/extension.js');
    const vscode = await import('vscode');
    const registerCommand = vi.mocked(vscode.commands.registerCommand);
    const registerTreeDataProvider = vi.mocked(vscode.window.registerTreeDataProvider);
    const createStatusBarItem = vi.mocked(vscode.window.createStatusBarItem);
    const createWebviewPanel = vi.mocked(vscode.window.createWebviewPanel);
    registerCommand.mockReturnValue({ dispose: vi.fn() } as never);
    registerTreeDataProvider.mockReturnValue({ dispose: vi.fn() } as never);

    await activate({
      globalStorageUri: { fsPath: '/tmp/taskdock' },
      subscriptions: []
    } as never);

    expect(registerTreeDataProvider).toHaveBeenCalledWith('taskDock.treeView', expect.objectContaining({
      getChildren: expect.any(Function),
      getTreeItem: expect.any(Function)
    }));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.openTree', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.openBoard', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.selectDatabase', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.toggleReadOnly', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('taskDock.createTask', expect.any(Function));
    expect(createStatusBarItem).toHaveBeenCalledTimes(3);
    expect(createWebviewPanel).not.toHaveBeenCalled();
  });
});
