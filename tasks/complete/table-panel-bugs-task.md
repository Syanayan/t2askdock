# テーブルパネル バグ修正タスク

> 目的: カテゴリ追加・タスク追加・パネル再表示に関する 4 つのバグを修正する。

---

## 対象ファイル

- `src/extension.ts`
- `src/ui/webview/task-table-webview-panel.ts`
- `test/unit/task-table-webview-panel.spec.ts`

---

## バグ一覧

---

### Bug-1: AddCategory 後にサイドバーのツリーが即座に反映されない

**症状**: カテゴリを追加・名称変更しても、VS Code 左サイドバーの **All Projects** ツリーが更新されない。テーブル内の表示はリフレッシュされるが、ツリーには即座に反映されない。

**根本原因**:
`extension.ts` の `addCategory` / `renameCategory` コールバックは DB 書き込みのみを行っており、`allProjectsProvider.refresh()` を呼んでいない。`postTasks()` でテーブル webview は更新されるが、サイドバーツリーへの通知がない。

```ts
// 現在: DB 書き込み後に refresh がない
async () => {
  const name = await vscode.window.showInputBox(...);
  if (!name?.trim()) return;
  await withProfileClient(profileId, async () => {
    await client.run('INSERT INTO projects ...');
  });
  // ← allProjectsProvider.refresh() がない
},
```

**修正方針**:
`createTablePanel` に `onCategoryChanged?: () => void` コールバックを追加し、`addCategory` / `renameCategory` の成功後に呼び出す。`extension.ts` 側では `allProjectsProvider.refresh()` を渡す。または `eventBus.publish({ type: 'TASK_UPDATED', ... })` を発火させる（TASK_UPDATED の subscriber が `allProjectsProvider.refresh()` を呼ぶため同等）。

---

### Bug-2: AddTask ボタンが機能しない

**症状**: テーブルビューの `AddTask` ボタンを押下しても何も起きない。

**根本原因**:
`task-table-webview-panel.ts` のメッセージハンドラが `openTaskDetail('')` を空文字で呼び出している。

```ts
if (isAddTaskMessage(message)) {
  await this.openTaskDetail(''); // 空文字を渡している
}
```

`extension.ts` の `taskDock.openTaskDetail` コマンドは `if (!taskId) return;` で即座に終了するため、タスク詳細画面が開かない。

また、ウェブビュー JS は `projectId` を送信しているが、ハンドラがこれを無視している:

```js
// webview JS 側: projectId を送っている
vscode.postMessage({type:'table:addTask', projectId: row?.dataset.projectId});
```

**修正方針**:
`TaskTableWebviewPanel` に `createTask?: (projectId?: string) => Promise<void>` コールバックを追加する。ハンドラを以下に変更する:

```ts
if (isAddTaskMessage(message)) {
  await this.createTask?.(message.projectId);
}
```

`extension.ts` 側の実装:

```ts
async (projectId) => {
  await vscode.commands.executeCommand('taskDock.createTask', { projectId, profileId });
},
```

`openTaskDetail` コールバックはタスク編集専用のまま残す。

---

### Bug-3: Archive Category ボタンは不要

**症状**: ヘッダーに表示されている `Archive Category` ボタンは仕様として不要。

**修正方針**: 以下をすべて削除する。

- webview HTML の `<button id="btn-archive-category">Archive Category</button>`
- webview JS の `archiveCategoryBtn` 変数と `addEventListener`
- `TaskTableWebviewPanel` コンストラクタの `archiveCategory?: (projectId: string) => Promise<void>` パラメータ
- `isArchiveCategoryMessage` / `isArchiveCategoryRequestMessage` 型ガード関数
- `render()` 内の `isArchiveCategoryMessage` ハンドラブロック
- `extension.ts` の `archiveCategory` コールバック（最後の引数）
- テストの `archiveCategory` モック・アサーション

---

### Bug-4: 他の WebView に移動後、DB 選択して開くと画面にデータが表示されない

**症状**: テーブルパネルを開いた状態でボードなど別の WebView に切り替え、その後 DB を選択してテーブルパネルに戻ると、データが一切表示されない（空白またはスピナーのまま）。

**根本原因（2 つ）**:

1. **PROFILE_SWITCHED 時にテーブルパネルが更新されない**  
   `extension.ts` の `PROFILE_SWITCHED` サブスクライバはボードパネルのみ再レンダリングしており、テーブルパネルは無視されている:

   ```ts
   const disposeProfileSwitchedReload = eventBus.subscribe('PROFILE_SWITCHED', async () => {
     await multiDbReadManager.refresh();
     myRecentTasksProvider.refresh();
     allProjectsProvider.refresh();
     if (boardWebviewPanel) {
       boardPanel.render(boardWebviewPanel, ...); // ← ボードのみ
     }
     // ← テーブルパネルの再レンダリングがない
   });
   ```

2. **postTasks() の競合（レースコンディション）**  
   `render()` が `panel.webview.html` をセットした直後に `postTasks()` を呼ぶが、Webview の JS が `window.addEventListener('message', ...)` を登録する前に `table:init` メッセージが届く場合がある。メッセージが失われると、データが表示されない。

**修正方針**:

- `PROFILE_SWITCHED` サブスクライバで、開いているテーブルパネルを `createTablePanel().render(panel)` で再レンダリングする。
- レースコンディション対策: webview JS の末尾で `vscode.postMessage({ type: 'table:ready' })` を送り、extension 側で `isReadyMessage` を受信してから `postTasks()` を呼ぶ。または `render()` 内の `await this.postTasks(panel.webview)` の呼び出しを削除し、`table:ready` メッセージを受信したときのみ `postTasks()` を呼ぶ。

---

## 実装順序

1. **Bug-3** — Archive Category 削除（コード削減、テスト修正）
2. **Bug-2** — AddTask 修正（`createTask` コールバック追加）
3. **Bug-1** — AddCategory 後のツリーリフレッシュ（`onCategoryChanged` コールバック追加）
4. **Bug-4** — PROFILE_SWITCHED 時のパネルリフレッシュ + ready ハンドシェイク

---

## 受け入れ基準

1. カテゴリ追加・名称変更後、サイドバーの All Projects ツリーが即座に更新される
2. AddTask ボタン押下でタスク作成画面が開き、正しい projectId が引き継がれる
3. `Archive Category` ボタンがヘッダーに存在しない
4. 別の WebView から戻りDB 選択後にテーブルパネルを開くと、すべてのデータが正常に表示される
