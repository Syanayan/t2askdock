import * as vscode from 'vscode';
import type { TaskTreeItem } from './task-tree-view-provider.js';

export function makeAllProjectsTreeItem(element: TaskTreeItem): vscode.TreeItem {
  const collapsibleState = element.hasChildren
    ? vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.None;
  const treeItem = new vscode.TreeItem(element.label, collapsibleState);

  if (element.kind === 'database') {
    treeItem.iconPath = element.available
      ? new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.gray'));
    treeItem.description = element.available ? undefined : '(接続不可)';
    treeItem.collapsibleState = element.available
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    treeItem.contextValue = 'database';
  }

  if (element.status) {
    treeItem.description = `[${element.status}]`;
    const iconByPriority: Record<string, vscode.ThemeIcon> = {
      low: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.gray')),
      medium: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue')),
      high: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow')),
      critical: new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.red'))
    };
    const iconByStatus: Record<string, vscode.ThemeIcon> = {
      todo: new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray')),
      in_progress: new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.blue')),
      done: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
      blocked: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'))
    };
    treeItem.iconPath =
      iconByStatus[element.status] ??
      (element.priority && iconByPriority[element.priority]) ??
      new vscode.ThemeIcon('circle-outline');
  }

  if (element.kind === 'project') {
    treeItem.command = {
      command: 'taskDock.openProjectTable',
      title: 'Open Table',
      arguments: [{ projectId: element.id, profileId: element.profileId, projectName: String(element.label) }]
    };
    treeItem.tooltip = `カテゴリ: ${element.label}`;
    treeItem.contextValue = element.kind;
  }

  if (element.kind === 'task' || element.kind === 'subtask') {
    treeItem.command = { command: 'taskDock.openTaskDetail', title: 'Open Task Detail', arguments: [element] };
    treeItem.contextValue = element.kind;
  }

  return treeItem;
}
