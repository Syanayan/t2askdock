# タスク作成 UX 改善タスク

> 目的: DBやカテゴリを意識したタスク作成フローに改善する。
> 「プロジェクト」という名称を「カテゴリ」に統一し、
> コマンド・右クリックの両方から直感的にタスクを作れるようにする。

---

## 背景・現状

| 項目 | 現状 |
|------|------|
| コマンドからのタスク作成 | タイトルとプロジェクトIDを手打ち、DBは常にアクティブDB |
| DB右クリックメニュー | なし |
| プロジェクト右クリックメニュー | なし（タスク/サブタスクのみ） |
| 「プロジェクト」という名称 | UI全体で使用中 |

---

## グループ A: ネーミング変更（プロジェクト → カテゴリ）

- [x] **A-1 UI上の「プロジェクト」表示を「カテゴリ」に変更**

  対象箇所（DBスキーマの `project_id` カラムは変更しない。表示ラベルのみ変更）:

  - `src/extension.ts` — Input Box の prompt 文言
    ```ts
    // before
    prompt: 'プロジェクトIDを入力してください'
    // after
    prompt: 'カテゴリIDを入力してください'
    ```
  - ツリーアイテムの `getTreeItem` — `'project'` kind のアイコン・contextValue はそのまま、
    ツールチップや description を「カテゴリ」表記に変更
  - Quick Pick / Input Box の title・prompt 文言全般

  > **注意**: `project_id` カラム名・`kind: 'project'` の内部識別子は変更しない。
  > 変更するのはユーザーに見える文言のみ。

---

## グループ B: コマンドからのタスク作成フロー改善

- [x] **B-1 `taskDock.createTask` の入力フローを DB → カテゴリ → タイトル の順に変更**

  **ファイル**: `src/extension.ts`（`taskDock.createTask` コマンド）

  ```
  1. DB選択 Quick Pick
     - multiDbReadManager.getProfiles() で登録済みDBを一覧表示
     - label = DB名、description = パス
     - プロファイルが0件 → 「DBが登録されていません。まずDBをマウントしてください。」

  2. カテゴリ選択 Quick Pick
     - 選択DBの TaskRepository.listProjects() で既存カテゴリを一覧表示
     - 末尾に「$(add) 新しいカテゴリを作成...」エントリ
     - 「新しいカテゴリを作成...」選択 → Input Box でカテゴリIDを手入力

  3. タイトル入力 Input Box

  4. 選択DB + カテゴリ + タイトルでタスクを作成
  ```

  `input.projectId` と `input.profileId` が既に指定されている場合（右クリック経由）は
  ステップ1・2をスキップして3から始める。

---

## グループ C: 右クリックメニュー追加

- [x] **C-1 DB ノードの右クリックメニューに「タスクを作成」を追加**

  **ファイル**: `package.json`

  ```json
  {
    "command": "taskDock.createTask",
    "when": "view == taskDock.allProjects && viewItem == database",
    "group": "navigation"
  }
  ```

  **ファイル**: `src/extension.ts`

  DB ノードからの `createTask` 呼び出しでは `profileId` のみ渡す（`projectId` は未指定）。
  B-1 のフローでステップ2（カテゴリ選択）から始まる。

  ```ts
  // ツリーの getTreeItem で database ノードに command を設定
  // または context menu からの引数として item を受け取る
  vscode.commands.registerCommand('taskDock.createTaskInDb', async (item: TaskTreeItem) => {
    if (item.kind !== 'database' || !item.profileId) return;
    await vscode.commands.executeCommand('taskDock.createTask', { profileId: item.profileId });
  });
  ```

  > `taskDock.createTask` に `profileId` のみ渡すと B-1 のステップ2から始まる。

- [x] **C-2 プロジェクト（カテゴリ）ノードの右クリックメニューに「タスクを作成」を追加**

  **ファイル**: `package.json`

  ```json
  {
    "command": "taskDock.createTask",
    "when": "view == taskDock.allProjects && viewItem == project",
    "group": "navigation"
  }
  ```

  **ファイル**: `src/extension.ts`

  プロジェクトノードからの呼び出しでは `profileId` + `projectId` を渡す。
  B-1 のフローでステップ3（タイトル入力）から始まる。

  ```ts
  vscode.commands.registerCommand('taskDock.createTaskInProject', async (item: TaskTreeItem) => {
    if (item.kind !== 'project' || !item.profileId) return;
    await vscode.commands.executeCommand('taskDock.createTask', {
      profileId: item.profileId,
      projectId: item.projectId
    });
  });
  ```

- [x] **C-3 `package.json` に新コマンドを追加**

  ```json
  {
    "command": "taskDock.createTaskInDb",
    "title": "Task Dock: このDBにタスクを作成"
  },
  {
    "command": "taskDock.createTaskInProject",
    "title": "Task Dock: このカテゴリにタスクを作成"
  }
  ```

---

## 実装順序

```
A-1                （文言変更）
→ B-1              （コマンドフロー改善）
→ C-1 → C-2 → C-3 （右クリックメニュー）
```

---

## 技術上の注意点

- **スキップロジック**: `taskDock.createTask` コマンドは引数で渡された情報量に応じて
  フローの途中から始める。
  - `profileId` なし → ステップ1から
  - `profileId` のみ → ステップ2から（カテゴリ選択）
  - `profileId` + `projectId` → ステップ3から（タイトル入力のみ）

- **カテゴリの新規作成**: 既存カテゴリが0件の場合は即座に新規作成 Input Box を表示する。

- **`contextValue` の活用**: `package.json` の `when` 条件で
  `viewItem == database` / `viewItem == project` を使うため、
  `getTreeItem` の `treeItem.contextValue` が正しく設定されていることを確認する。
  現在 `database` は設定済み、`project` は未設定のため追加が必要。
