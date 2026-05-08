# 複数DB ツリービュー実装タスク

> 目的: 登録済みの全 SQLite DB ファイルをツリービューの最上位に表示し、
> DB → プロジェクト → タスク → サブタスク の階層で一覧できるようにする。

---

## 背景・現状

| 項目 | 現状 |
|------|------|
| `AllProjectsProvider` | アクティブな1DBのプロジェクトしか表示しない |
| `TaskTreeItem` kind | `'project'` / `'task'` / `'subtask'` / `'header'` のみ |
| タスク作成 | アクティブDBに固定（`activeClientHolder` 経由） |
| DB切り替え | `taskDock.selectDatabase` で1本ずつ切り替え |

### 目標とするツリー構造

```
[DB] work-a.sqlite3
  └─ [Project] プロジェクトA
       ├─ [Task] タスク1
       │    └─ [Subtask] サブタスク1
       └─ [Task] タスク2

[DB] work-b.sqlite3
  └─ [Project] プロジェクトB
       └─ [Task] タスク3
```

---

## グループ A: 読み取り接続管理

- [x] **A-1 `MultiDbReadManager` を実装**

  **ファイル**: `src/infra/sqlite/multi-db-read-manager.ts`（新規作成）

  登録済みの全 DB プロファイルに対して読み取り用接続を保持・管理するクラス。

  ```ts
  export class MultiDbReadManager {
    // profileId → { client, taskRepository } のマップ
    private connections = new Map<string, { client: BetterSqlite3Client; repo: TaskRepository }>();

    public constructor(
      private readonly profileRepository: DatabaseProfileRepository,
      private readonly osFileAccessChecker: OsFileAccessChecker
    ) {}

    // 全プロファイルの接続を初期化/更新
    public async refresh(): Promise<void>;

    // プロファイルIDからタスクリポジトリを取得
    public getRepo(profileId: string): TaskRepository | undefined;

    // 全プロファイル情報（接続可否付き）を返す
    public getProfiles(): Array<{ profileId: string; name: string; path: string; available: boolean }>;

    // 全接続をクローズ
    public closeAll(): void;
  }
  ```

  - `refresh()` では `profileRepository.findAll()` を呼び、
    - 新規プロファイル → `BetterSqlite3Client` を開き `ActiveClientHolder` でラップして `TaskRepository` を生成
    - 削除済みプロファイル → `client.close()` してマップから除去
    - ファイルが存在しない/アクセス不可 → `available: false` としてマップに登録しない

- [x] **A-2 `extension.ts` で `MultiDbReadManager` を初期化・DI**

  **ファイル**: `src/extension.ts`

  ```ts
  const multiDbReadManager = new MultiDbReadManager(databaseProfileRepository, osFileAccessChecker);
  await multiDbReadManager.refresh();
  context.subscriptions.push({ dispose: () => multiDbReadManager.closeAll() });
  ```

  - `AllProjectsProvider` に `multiDbReadManager` を渡す

---

## グループ B: ツリービュー UI 改修

- [x] **B-1 `TaskTreeItem` に `'database'` kind を追加**

  **ファイル**: `src/ui/tree/task-tree-view-provider.ts`（既存）

  ```ts
  export type TaskTreeItem =
    | { kind: 'database'; id: string; label: string; available: boolean }
    | { kind: 'project'; id: string; label: string; projectId: string; profileId: string }
    | { kind: 'task'; ... }
    | { kind: 'subtask'; ... }
    | { kind: 'header'; ... };
  ```

  `profileId` フィールドを `'project'` / `'task'` / `'subtask'` にも追加し、
  どのDBのアイテムかを追跡できるようにする。

- [x] **B-2 `AllProjectsProvider` を DB レベル対応に改修**

  **ファイル**: `src/ui/tree/all-projects-provider.ts`（既存）

  `getChildren()` のロジックを3段階に変更:

  ```
  element が undefined（ルート）
    → multiDbReadManager.getProfiles() を返す（'database' kind）

  element が 'database'
    → multiDbReadManager.getRepo(profileId) でプロジェクト一覧を取得

  element が 'project'
    → element.profileId のリポジトリでタスク一覧を取得（既存ロジック流用）

  element が 'task'
    → 既存のサブタスク取得ロジックを流用
  ```

- [x] **B-3 DB レベルのツリーアイテムにアイコン・状態表示を設定**

  **ファイル**: `src/extension.ts`（`getTreeItem` 内）

  ```ts
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
  ```

---

## グループ C: イベント連携・自動更新

- [x] **C-1 プロファイル変更時にツリーを自動更新**

  **ファイル**: `src/extension.ts`

  ```ts
  eventBus.subscribe('PROFILE_SWITCHED', async () => {
    await multiDbReadManager.refresh();
    allProjectsProvider.refresh();
  });

  eventBus.subscribe('DATABASE_DIRECTORY_UPDATED', async () => {
    await multiDbReadManager.refresh();
    allProjectsProvider.refresh();
  });
  ```

  既存の `TASK_UPDATED` サブスクリプションにも `allProjectsProvider.refresh()` が
  含まれているため変更不要。

---

## グループ D: タスク作成の DB 指定

- [x] **D-1 `taskDock.createTask` に `profileId` を渡せるよう拡張**

  **ファイル**: `src/extension.ts`（`taskDock.createTask` コマンド）

  コマンドに `profileId?: string` を追加。
  指定された場合は `multiDbReadManager.getRepo(profileId)` のクライアントを使って
  プロジェクトを INSERT する。

  > 現在は `homeClient.run('INSERT OR IGNORE INTO projects ...')` で固定。
  > 切り替え先DBにプロジェクトを作る場合は対象クライアントを使う必要がある。

- [x] **D-2 ツリーのプロジェクトノード右クリックからタスク作成時に `profileId` を渡す**

  **ファイル**: `src/extension.ts`（`taskDock.createSubtask` 付近）

  `TaskTreeItem` の `profileId` を `taskDock.createTask` に引き渡す。

  ```ts
  vscode.commands.registerCommand('taskDock.createTask', async (input?) => {
    // input.profileId が指定されていればそのDBに作成
    const targetClient = input?.profileId
      ? multiDbReadManager.getRepo(input.profileId)?.client
      : activeClientHolder.get();
    ...
  });
  ```

---

## 実装順序

```
A-1 → A-2          （接続管理）
→ B-1 → B-2 → B-3  （ツリー UI）
→ C-1               （イベント連携）
→ D-1 → D-2         （タスク作成）
```

---

## 技術上の注意点

- **読み取り専用接続の考慮**: `AllProjectsProvider` で使う接続は
  表示専用のため `BetterSqlite3Client` をそのまま使う。
  書き込みは `activeClientHolder` 経由のみとし、接続の役割を分離する。

- **ホームDB自体の扱い**: 起動直後はホームDBがアクティブDBでもあるため、
  `MultiDbReadManager` の `refresh()` ではホームDBのプロファイルも対象に含める。
  ただし `db_profiles` テーブルにホームDB自身が登録されていない場合は
  別途ホームDBを先頭ノードとして表示することを検討する。

- **接続の重複**: `activeClientHolder` が保持するクライアントと
  `MultiDbReadManager` が保持するクライアントは別インスタンスになる。
  `better-sqlite3` は同一ファイルへの複数接続を許容するため問題ない。

- **ファイルが見つからない場合**: DB ファイルが削除/移動された場合、
  `available: false` のノードとして表示し、エラーにしない。
