# 実務利用までのタスク

> 目的: タスクA/B/C完了後に「作成 → ツリー表示 → ボード確認 → D&Dで状態変更」の動線を実現する。

---

## グループA: タスク操作UI（最優先）

- [x] **A-1 タスク作成ダイアログ**
  - `vscode.window.showInputBox` でタイトル・プロジェクトIDを収集し `CreateTaskUseCase` を呼び出す
  - `actorId` / `now` / デフォルト値（status: 'todo', priority: 'medium'）を自動補完する
- [x] **A-2 ツリー自動更新**
  - `TASK_UPDATED` イベントを受け取り `vscode.EventEmitter` で `onDidChangeTreeData` を発火する
  - `TaskTreeViewProvider` に `refresh()` メソッドを追加する
- [x] **A-3 エラー通知**
  - UseCase が例外を投げた場合に `vscode.window.showErrorMessage` でメッセージを表示する
  - `E_*` エラーコードをユーザー向け日本語メッセージにマッピングする

---

## グループB: ボード表示（次優先）

- [ ] **B-1 ボードへのタスク描画**
  - `activate()` でタスク一覧を取得し WebviewPanel に `postMessage` で JSON を渡す
  - Webview 側の JS でカラムごとにタスクカードを描画する
- [ ] **B-2 ボードD&D配線**
  - カード D&D 完了時に Webview → Extension ホストへ `postMessage`（taskId / toStatus）
  - `BoardWebviewPanel.onDrop()` から `MoveTaskStatusUseCase` を呼び出す
- [ ] **B-3 ボード更新後ツリー連動**
  - `TASK_UPDATED` イベントでツリーも合わせて更新する（A-2 の `refresh()` を再利用）

---

## グループC: タスク詳細（必要に応じて）

- [x] **C-1 タスク詳細パネル**
  - TreeItem クリックで詳細 Webview を開き title / status / priority / tags を表示する
- [x] **C-2 タスク編集**
  - 詳細パネルまたは `showInputBox` でタイトル・優先度・期日を編集し `UpdateTaskUseCase` を呼び出す
- [x] **C-3 タスク削除**
  - ツリーの右クリックメニュー（`contributes.menus` の `view/item/context`）から削除する

---

## 着手順（最小動線優先）

`A-1 → A-2 → A-3 → B-1 → B-2`

上記完了時点で「作成 → ツリー表示 → ボード確認 → D&Dで状態変更」の実務最小動線が確認できる。
