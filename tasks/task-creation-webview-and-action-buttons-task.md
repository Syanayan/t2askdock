# タスク作成 Webview / アクションボタン 実装タスク

> 目的: タスク作成と編集を同じ Webview で実現し、Web UI からの追加操作を統一する。

---

## 目的

- タスク作成時に専用 Webview 画面を表示する
- 新規作成と編集を同じ UI で共通化する
- カテゴリー追加・タスク追加ボタンを web 画面に配置する
- `Ctrl + Enter` で入力完了できるようにする

---

## 実装対象

- `src/ui/webview/task-detail-webview-panel.ts`
- `src/ui/webview/board-webview-panel.ts`
- `src/ui/webview/category-webview-panel.ts` など Webview UI 実装箇所
- `src/extension.ts`
- `src/core/usecase/create-task-usecase.ts`

---

## 要件

- `task create` は毎回専用の Webview を開く
- 作成画面は編集画面と同じ HTML/CSS/JS を使い回す
- 作成時は `INSERT`、編集時は `UPDATE` の振る舞いを明確に分ける
- タスク追加ボタンはタスク一覧表示時に右上に配置する
- カテゴリー追加ボタンはカテゴリー一覧時に右上に配置する
- カテゴリー追加時は名称のみ入力し、`Ctrl + Enter` で追加できる
- タスク追加時も `Ctrl + Enter` で保存できる

---

## グループA: Webview 再利用設計

- [ ] **A-1 `TaskDetailWebviewPanel` の作成/改善**
  - `render(panel, taskId?)` のように `taskId` が無い場合は新規作成モードに切り替える
  - HTML 内で `isCreateMode` / `isEditMode` フラグを使い分ける
  - `Save` ボタンは新規時に `createTask`, 編集時に `updateTask` メッセージを送信する

- [ ] **A-2 コマンドの共通化**
  - `src/extension.ts` の `taskDock.openTaskDetail` 相当の呼び出しを、新規作成用 `taskDock.openTaskCreate` でも同じ `TaskDetailWebviewPanel` を使う
  - `createTask` / `updateTask` の差分は `taskId` の有無で判定

- [ ] **A-3 HTML 内の表示制御**
  - `Create Task` / `Edit Task` の見出しを切り替える
  - 作成時は空の入力フィールドを表示し、編集時は既存値を埋める
  - `Save` 送信前に必須項目チェックを行う

---

## グループB: 追加ボタンと UI 位置

- [ ] **B-1 カテゴリー追加ボタン**
  - カテゴリー一覧表示時の右上に `Add Category` ボタンを配置
  - ボタン押下で `CategoryCreate` Webview または入力モーダルを開く
  - 入力フィールドは `name` だけで、`Ctrl + Enter` による送信をサポートする

- [ ] **B-2 タスク追加ボタン**
  - タスク一覧表示時に `Add Task` ボタンを右上に配置
  - 押下で `TaskCreate` Webview を開く
  - カンバンの中に直接追加する UI は実装しない

- [ ] **B-3 `Ctrl + Enter` 処理**
  - 作成/編集フォームに `keydown` ハンドラを追加
  - `Ctrl + Enter` でフォーム送信をトリガー
  - 既存 Enter / Escape 動作と競合しないように整理する

---

## 受け入れ基準

1. `Add Task` ボタン押下時に専用 Webview が開く
2. `Add Category` ボタン押下で名称入力のみの作成フローが開始する
3. 同じ画面で新規作成と編集が切り替わる
4. `Ctrl + Enter` で作成/追加が実行できる
5. カンバン内の直接追加 UI は存在しない
