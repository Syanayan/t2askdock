import * as vscode from 'vscode';

const notImplementedMessage = 'taskDock command is registered. Implementation wiring is pending.';

export function activate(context: vscode.ExtensionContext): void {
  const commandIds = [
    'taskDock.openTree',
    'taskDock.openBoard',
    'taskDock.selectDatabase',
    'taskDock.toggleReadOnly',
    'taskDock.createTask'
  ] as const;

  for (const commandId of commandIds) {
    const disposable = vscode.commands.registerCommand(commandId, async () => {
      await vscode.window.showInformationMessage(notImplementedMessage);
      return { commandId };
    });
    context.subscriptions.push(disposable);
  }
}

export function deactivate(): void {}
