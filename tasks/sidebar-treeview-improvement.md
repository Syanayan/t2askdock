# サイドバー Tree View 改善タスク

> 目的: サイドバーに2つの View（myRecentTasks / allProjects）を追加し、
> ソート・フィルタリング機能付きのツールバーアクションを実装する。

---

## グループE: データ層の拡張

- [x] **E-1 自分のタスク取得クエリの追加**
  - `TaskRepository` インターフェースに `listMyTasks(input)` を追加
  - 条件: `(created_by = ? AND assignee IS NULL) OR assignee = ?`
  - ステータスが `done` のものは除外 (`status != 'done'`)
  - ソート種別（`updatedAt` / `priority` / `dueDate`）と `limit` を引数に取る
  - SQLite 実装を追加する

- [x] **E-2 プロジェクト別タスク取得にソート・フィルタを追加**
  - `listTasksByProject()` にソート種別と `done` 除外フィルタを追加
  - または `listTasksByProjectSorted(input)` として別メソッドで追加
  - 優先度ソート: `CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`
  - 期限ソート: `due_date ASC NULLS LAST`
  - `sortPriority` 時は `priority = 'low'` を非表示にするフィルタも適用

---

## グループF: package.json の設定追加

- [ ] **F-1 2つ目の View を登録**
  - `contributes.views.taskDock` に以下を追加:
    - `id: taskDock.myRecentTasks`, `name: My Tasks`
    - `id: taskDock.allProjects`, `name: All Projects`
  - 既存の `taskDock.treeView` は削除または役割を `allProjects` に移行する

- [ ] **F-2 ソートコマンドを登録**
  - 各 View × 3種 = 最大6コマンドを `contributes.commands` に追加:
    - `taskDock.myRecentTasks.sortUpdated` (🕒)
    - `taskDock.myRecentTasks.sortPriority` (🔥)
    - `taskDock.myRecentTasks.sortDeadline` (📅)
    - `taskDock.allProjects.sortUpdated` / `sortPriority` / `sortDeadline`
  - `contributes.menus.view/title` に各 View に対応するボタンを追加:
    ```json
    { "command": "taskDock.allProjects.sortUpdated", "when": "view == taskDock.allProjects", "group": "navigation" }
    ```

---

## グループG: Tree View Provider の実装

- [x] **G-1 MyRecentTasksProvider の作成**
  - `src/ui/tree/my-recent-tasks-provider.ts` を新規作成
  - コンストラクタ引数: `loader`（`listMyTasks` を持つ）、`userId: string`
  - ソート種別を内部 State で保持: `type SortKey = 'updatedAt' | 'priority' | 'dueDate'`
  - `setSort(key: SortKey)` メソッドで State を更新し `refresh()` を呼ぶ
  - `getChildren()` でルート呼び出し時に `listMyTasks` を実行して最大5件返す
  - タスクアイテムには `status` / `priority` のアイコンをそのまま流用する

- [ ] **G-2 AllProjectsProvider の作成（または既存 Provider を改修）**
  - `src/ui/tree/all-projects-provider.ts` を新規作成（または既存を改修）
  - Level 1: プロジェクト一覧（`listProjects()` を使用）
  - Level 2: 各プロジェクトの直近タスク最大5件（ソート・フィルタ適用）
  - プロジェクトアイテムのクリックで `taskDock.openBoard` コマンドをプロジェクト引数付きで実行
  - ソート State を View ごとに保持する

- [x] **G-3 done 除外フィルタの共通化**
  - `done` / `blocked` ステータスは UI 側でも除外するガードを追加
  - DB クエリ側（E-1/E-2）と UI 側の両方で除外するか、どちらか一方に統一するかを決定して実装

---

## グループH: extension.ts での登録

- [ ] **H-1 新しい View を TreeDataProvider と紐づけ**
  - `vscode.window.registerTreeDataProvider('taskDock.myRecentTasks', myRecentTasksProvider)` を登録
  - `vscode.window.registerTreeDataProvider('taskDock.allProjects', allProjectsProvider)` を登録
  - `userId` は `vscode.workspace.getConfiguration` または固定値（初期実装）から取得

- [ ] **H-2 ソートコマンドを登録**
  - F-2 で定義した各コマンドを `vscode.commands.registerCommand` で登録
  - 押下時に対応する Provider の `setSort(key)` を呼ぶ

---

## 着手順（最小動線優先）

`E-1 → G-1 → F-1(myRecentTasks のみ) → H-1(myRecentTasks のみ) → F-2(myRecentTasks のみ) → H-2(myRecentTasks のみ)`

上記でまず myRecentTasks View が動作する。その後:

`E-2 → G-2 → F-1(allProjects) → H-1(allProjects) → F-2(allProjects) → H-2(allProjects)`

---

## 技術上の注意点

- `contributes.views.taskDock` に複数 View を追加すると、サイドバー内にセクションが増える（VS Code の仕様）
- ソートボタンはトグルではなく排他選択のため、現在のソートを `contextValue` または `title` のサフィックスで表現することでボタンの「選択中」状態をハイライトできる
- `userId` の取得方法は後続の認証実装に依存するため、初期は `vscode.workspace.getConfiguration('taskDock').get('userId', 'me')` などで仮実装でよい
- `view/title` メニューの `group: "navigation"` でボタンが View のタイトルバー右端に並ぶ
