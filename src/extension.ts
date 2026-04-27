import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('t2askdock.hello', async () => {
    await vscode.window.showInformationMessage('t2askdock extension is ready.');
  });

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
