# ツリーテーブルビュー実装タスク

> 目的: スクリーンショットのような「ツリー構造 × 列表示」のタスク管理UIを実現する。
> VS Code標準のTreeViewは列表示に対応していないため、Webviewベースのテーブルで実装する。

---

## グループA: データ層の拡張

- [x] **A-1 サブタスク取得の実装**
  - `TaskRepository.listTasksByProject()` にサブタスク（`parent_task_id` あり）を含めるよう拡張
  - または `listSubtasksByParent(parentTaskId)` メソッドを追加
  - ツリー構造を返す型 `TaskTreeNode` を定義する

- [x] **A-2 担当者・ステータスの取得確認**
  - `findDetailById` で `assignee` / `status` / `priority` が取得できることを確認
  - 現状でも取得できているが、テーブル表示用に `listTasksWithDetail()` を追加する

- [x] **A-3 進捗フィールドの追加（マイグレーションv2）**
  - `tasks` テーブルに `progress INTEGER NOT NULL DEFAULT 0` カラムを追加
  - `Migrator` に v2 マイグレーションを登録する
  - `TaskRepository.update()` で `progress` を更新できるようにする

---

## グループB: Webviewテーブルの実装

- [ ] **B-1 TaskTableWebviewPanel の作成**
  - `src/ui/webview/task-table-webview-panel.ts` を新規作成
  - 全タスクをツリー構造（親→子）で取得してWebviewに渡す
  - `taskDock.openTable` コマンドとして登録する

- [ ] **B-2 テーブルHTML/CSSの実装**
  - 列構成: タイトル / ステータス / 担当者 / 優先度 / 進捗
  - 親タスクは折りたたみ可能（▶/▼トグル）
  - インデントでサブタスクを視覚的に表現する
  - ステータスはバッジ表示（Todo=グレー / In Progress=青 / Done=緑 / Blocked=赤）

- [ ] **B-3 テーブルからのタスク操作**
  - 行クリックでタスク詳細パネルを開く
  - ステータスセルクリックでドロップダウン変更
  - 変更後に `MoveTaskStatusUseCase` を呼び出してWebviewを再描画する

- [ ] **B-4 package.json にコマンド追加**
  - `taskDock.openTable` コマンドを `contributes.commands` に追加
  - アイコンをテーブル系のものに設定する

---

## グループC: サイドバーツリービューの改善

- [ ] **C-1 サブタスクの展開表示**
  - `TaskTreeViewProvider.getChildren()` で `kind === 'task'` かつ `hasChildren === true` の場合にサブタスクを返す
  - `TaskRepository` からサブタスクを取得する

- [ ] **C-2 ツリーアイテムにステータスを表示**
  - `getTreeItem()` の `description` にステータスを表示（例: `[In Progress]`）
  - `iconPath` で優先度・ステータスに応じた色アイコンを設定する（ThemeIcon使用）

- [ ] **C-3 サブタスク作成コマンドの追加**
  - 親タスクの右クリックメニューから「サブタスクを追加」を実行できるようにする
  - `parentTaskId` を引き継いで `CreateTaskUseCase` を呼び出す

---

## グループD: 進捗の自動計算（任意）

- [ ] **D-1 フェーズ進捗の自動集計**
  - 親タスクの進捗をサブタスクの完了率から自動計算する
  - `done` ステータスのサブタスク数 / 全サブタスク数 × 100
  - テーブルの進捗列に表示する

- [ ] **D-2 進捗の手動入力**
  - テーブルの進捗セルをクリックして数値入力（0〜100）
  - `UpdateTaskUseCase` の入力に `progress` を追加して保存する

---

## 着手順（最小動線優先）

`A-1 → B-1 → B-2 → B-3 → C-1 → C-2`

上記完了時点でスクリーンショットに近い「ツリー × 列表示」のタスク管理UIが動作する。

---

## 技術上の注意点

- Webviewの `postMessage` / `onDidReceiveMessage` パターンはボードビューで実績あり（[board-webview-panel.ts](../src/ui/webview/board-webview-panel.ts) を参考にする）
- VS Code の `ThemeIcon` でステータス別アイコンを設定できる（`circle-filled`, `check`, `error` など）
- テーブルのツリー展開はネイティブの `<details>/<summary>` または JS で実装する
