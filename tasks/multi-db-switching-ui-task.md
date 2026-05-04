# 複数DB切り替え UI 実装タスク

> 目的: `MountDatabaseUseCase` 等の既存ユースケースに UI を接続し、
> ユーザーが複数の SQLite ファイルを登録・切り替えてプロジェクトを管理できるようにする。

---

## 背景・現状

| 項目 | 現状 |
|------|------|
| DB ファイル | 起動時に `globalStorage/taskdock.sqlite3` 1本のみ固定生成 |
| `db_profiles` テーブル | スキーマは存在するが常に空（登録 UI なし） |
| `taskDock.selectDatabase` | `profileId: 'default'` を渡して `SwitchDatabaseProfileUseCase` を呼ぶだけ。プロファイル選択 UI なし |
| マウント系ユースケース | 実装・DI 済みだが、呼び出しコマンドが未登録 |
| 実際の切り替え | `AppContainer` が起動時の `client` に固定されており、プロファイルを変えてもデータ取得先が変わらない |

### アーキテクチャ上の前提

```
globalStorage/taskdock.sqlite3   ← ホームDB（db_profiles / audit_logs などを保持）
/path/to/work-a.sqlite3          ← プロジェクトA のDB（tasks / projects / comments）
/path/to/work-b.sqlite3          ← プロジェクトB のDB
```

- `db_profiles` はホームDBに格納し、常に参照可能にする。
- プロファイル切り替え時は対象ファイルに新しい `BetterSqlite3Client` を接続し、
  マイグレーションを適用したうえで `TaskRepository` 等をその接続へ差し替える。

---

## グループ A: アクティブ DB を切り替え可能にする（アーキテクチャ基盤）

- [x] **A-1 `ActiveClientHolder` を実装**

  **ファイル**: `src/infra/sqlite/active-client-holder.ts`（新規作成）

  起動後にアクティブな `BetterSqlite3Client` を保持し、差し替えを可能にするクラス。

  ```ts
  export class ActiveClientHolder {
    private current: SqliteClient;

    public constructor(initial: SqliteClient) {
      this.current = initial;
    }

    public get(): SqliteClient {
      return this.current;
    }

    public switch(next: SqliteClient): void {
      this.current = next;
    }
  }
  ```

- [x] **A-2 `TaskRepository` 等が `ActiveClientHolder` 経由でクライアントを取得するよう変更**

  **ファイル**: `src/infra/sqlite/repositories/task-repository.ts` 他

  コンストラクタ引数の型を `SqliteClient` → `ActiveClientHolder` に変更し、
  各メソッド内で `this.holder.get()` を呼ぶ。
  対象: `TaskRepository` / `CommentRepository` / `AuditLogRepository` /
  `FeatureFlagRepository` / `TransactionManager`

  > **注意**: `DatabaseProfileRepository` はホームDB のみ使うため変更不要。

- [x] **A-3 `extension.ts` で `ActiveClientHolder` を初期化**

  **ファイル**: `src/extension.ts`

  ```ts
  const homeClient = new BetterSqlite3Client(homeDatabasePath);
  const activeClientHolder = new ActiveClientHolder(homeClient);

  const appContainer = new AppContainer({
    taskRepository: new TaskRepository(activeClientHolder),
    commentRepository: new CommentRepository(activeClientHolder),
    ...
    databaseProfileRepository: new DatabaseProfileRepository(homeClient), // ホームDB 固定
  });
  ```

- [x] **A-4 プロファイル切り替え時に `ActiveClientHolder.switch()` を呼ぶ**

  **ファイル**: `src/ui/commands/command-registry.ts`

  `taskDock.selectDatabase` 成功後に `activeClientHolder.switch(newClient)` を呼ぶ。
  `CommandRegistry` に `activeClientHolder` を DI する。

  切り替え手順:
  1. `SwitchDatabaseProfileUseCase.execute({ profileId })` を呼び、パスを取得
  2. 対象パスに新しい `BetterSqlite3Client` を生成
  3. マイグレーション（V1〜V3）を適用
  4. `activeClientHolder.switch(newClient)` で差し替え
  5. `stateStore.patch(...)` / `eventBus.publish(...)` を従来通り実行

- [x] **A-5 `ActiveClientHolder` のユニットテスト**

  **ファイル**: `test/unit/infra/sqlite/active-client-holder.spec.ts`（新規作成）

  - `switch()` 後に `get()` が新しいクライアントを返すことを確認
  - 切り替え前後でリポジトリのクエリ先が変わることをスタブで確認

---

## グループ B: プロファイル選択 Quick Pick UI

- [x] **B-1 `taskDock.selectDatabase` を Quick Pick に変更**

  **ファイル**: `src/extension.ts`（既存コマンド差し替え）

  現在の `commands['taskDock.selectDatabase']({ profileId: ... })` を以下のフローに置き換える:

  ```
  1. useCases のない独立処理として直接記述（CommandRegistry には移植しない）
  2. DatabaseProfileRepository.findAll() でプロファイル一覧を取得
  3. vscode.window.showQuickPick で一覧を表示
     - 各アイテム: label = name、description = path、detail = mode / mountSource
     - 末尾に「$(add) 個別ファイルを追加...」エントリ
     - 末尾に「$(folder) フォルダを追加...」エントリ
  4. 「個別ファイルを追加」を選択 → taskDock.mountDatabase を呼ぶ
  5. 「フォルダを追加」を選択 → taskDock.registerDatabaseDirectory を呼ぶ
  6. プロファイルを選択 → SwitchDatabaseProfileUseCase + ActiveClientHolder.switch()
  ```

  プロファイルが0件の場合:

  ```
  「登録済みのDBはありません。ファイルかフォルダを追加してください。」と表示し、
  追加ショートカットのみ提示する。
  ```

- [x] **B-2 ステータスバーにアクティブプロファイル名を表示**

  **ファイル**: `src/ui/status/status-bar-controller.ts`（既存）

  `snapshot.db` の表示を `activeProfile` の `name` に変更する。
  現在は `activeProfile` の ID のみ表示のため、
  `ExtensionState` に `activeProfileName: string | null` を追加する、
  またはステータスバーコントローラに `DatabaseProfileRepository` を渡して名前を引く。

---

## グループ C: 個別ファイルマウントコマンド

- [x] **C-1 `taskDock.mountDatabase` コマンドを登録**

  **ファイル**: `src/extension.ts`

  ```ts
  vscode.commands.registerCommand('taskDock.mountDatabase', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'SQLite Database': ['sqlite', 'sqlite3', 'db'] },
      title: 'マウントする SQLite ファイルを選択'
    });
    if (!uris || uris.length === 0) return;

    const path = uris[0].fsPath;
    const name = await vscode.window.showInputBox({
      prompt: 'このDBの表示名を入力してください',
      value: require('node:path').basename(path),
      ignoreFocusOut: true
    });
    if (!name) return;

    try {
      await useCases.mountDatabaseUseCase.execute({ path, name, mode: 'readWrite', actorRole: 'admin' });
      void vscode.window.showInformationMessage(`DB "${name}" をマウントしました`);
    } catch (error) {
      void vscode.window.showErrorMessage(toUserFacingMessage(error));
    }
  })
  ```

- [x] **C-2 `package.json` に `taskDock.mountDatabase` を追加**

  ```json
  {
    "command": "taskDock.mountDatabase",
    "title": "Task Dock: DBファイルをマウント"
  }
  ```

---

## グループ D: ディレクトリ一括登録コマンド

- [x] **D-1 `taskDock.registerDatabaseDirectory` コマンドを登録**

  **ファイル**: `src/extension.ts`

  ```ts
  vscode.commands.registerCommand('taskDock.registerDatabaseDirectory', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'SQLite ファイルを含むフォルダを選択'
    });
    if (!uris || uris.length === 0) return;

    try {
      const out = await useCases.registerDatabaseDirectoryUseCase.execute({
        directoryPath: uris[0].fsPath,
        actorRole: 'admin'
      });
      void vscode.window.showInformationMessage(
        `${out.registeredProfiles.length} 件の DB を登録しました`
      );
    } catch (error) {
      void vscode.window.showErrorMessage(toUserFacingMessage(error));
    }
  })
  ```

- [x] **D-2 `package.json` に `taskDock.registerDatabaseDirectory` を追加**

  ```json
  {
    "command": "taskDock.registerDatabaseDirectory",
    "title": "Task Dock: DBフォルダを登録"
  }
  ```

---

## グループ E: アンマウント UI

- [ ] **E-1 Quick Pick アイテムに「アンマウント」ボタンを追加**

  B-1 の Quick Pick で各プロファイルアイテムに `buttons` を追加:

  ```ts
  {
    label: profile.name,
    description: profile.path,
    detail: `${profile.mode} / ${profile.mountSource}`,
    profileId: profile.profileId,
    buttons: [{
      iconPath: new vscode.ThemeIcon('trash'),
      tooltip: 'このDBをアンマウント'
    }]
  }
  ```

  `onDidTriggerItemButton` で `UnmountDatabaseUseCase.execute()` を呼び、
  一覧を再描画する。

- [ ] **E-2 アクティブプロファイルをアンマウントしようとした場合の保護**

  現在アクティブなプロファイルはアンマウント不可とし、
  エラーメッセージ「使用中のDBはアンマウントできません」を表示する。

---

## グループ F: 新規DB作成ショートカット

現状、マウントは既存ファイルのみ対象。
新しい空のDBを作って即使い始めたいユースケースに対応する。

- [ ] **F-1 `taskDock.createDatabase` コマンドを登録**

  ```ts
  vscode.commands.registerCommand('taskDock.createDatabase', async () => {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'SQLite Database': ['sqlite3'] },
      title: '新しいDBファイルの保存先を選択'
    });
    if (!uri) return;

    // 空ファイルを作成してからマウント
    await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    await vscode.commands.executeCommand('taskDock.mountDatabase', uri.fsPath);
  })
  ```

  > **注意**: `writeFile` で空ファイルを作成した後 `MountDatabaseUseCase` でマウントし、
  > 切り替え時のマイグレーションでテーブルを自動生成する。

- [ ] **F-2 `package.json` に `taskDock.createDatabase` を追加**

---

## グループ G: エラーコード対応・ステータスバー更新

- [ ] **G-1 `toUserFacingMessage` に新しいエラーコードを追加**

  **ファイル**: `src/extension.ts`（`toUserFacingMessage` 関数）

  ```ts
  [ERROR_CODES.FILE_NOT_FOUND]: 'DBファイルが見つかりません。パスを確認してください。',
  [ERROR_CODES.ACCESS_DENIED]: 'DBファイルへのアクセスが拒否されました。ファイル権限を確認してください。',
  [ERROR_CODES.FORBIDDEN]: 'この操作には管理者権限が必要です。',
  ```

- [ ] **G-2 ステータスバー更新を `DATABASE_DIRECTORY_UPDATED` イベントにフック**

  `eventBus.subscribe('DATABASE_DIRECTORY_UPDATED', () => refreshStatusBar())` を追加し、
  ディレクトリスキャン後にステータスバーを自動更新する。

- [ ] **G-3 プロファイル切り替え後にボード/リスト表示を再ロード**

  `eventBus.subscribe('PROFILE_SWITCHED', () => { board を再ロード })` を追加し、
  DB 切り替え後にタスク一覧が新しいDBの内容に自動更新されるようにする。

---

## 実装順序

```
A-1 → A-2 → A-3 → A-4 → A-5   （切り替え基盤）
→ C-1 → C-2                     （個別マウント UI）
→ D-1 → D-2                     （フォルダ登録 UI）
→ B-1 → B-2                     （Quick Pick。C/D が呼べる状態で実装）
→ E-1 → E-2                     （アンマウント UI）
→ F-1 → F-2                     （新規DB作成）
→ G-1 → G-2 → G-3               （仕上げ）
```

---

## 技術上の注意点

- **`DatabaseProfileRepository` はホームDBに固定**: プロファイル切り替え後も
  マウント一覧はホームDBから読む。`ActiveClientHolder` の差し替え対象外とする。

- **切り替え先DBへのマイグレーション**: 外部ファイルをマウントする際は
  V1〜V3 マイグレーションを適用してからアクティブにする。
  既存データがある場合は `IF NOT EXISTS` / `IF NOT EXISTS COLUMN` で冪等に動作する。

- **`bootstrapMigrations` の再利用**: 新規接続時に `Migrator.migrate()` を
  `bootstrapMigrations` と同じ引数で呼ぶことで、ホームDB と同じスキーマを保証する。

- **同一プロセスで複数 `BetterSqlite3Client`**: `better-sqlite3` は同一プロセス内で
  複数の接続を持てる。ただし切り替え前の client は `close()` を呼ぶか、
  `context.subscriptions` で管理して Extension 終了時にクリーンアップする。

- **ReadOnly モードでの切り替え**: 切り替え先 DB を ReadOnly でマウントした場合は
  `SwitchDatabaseProfileUseCase` がそれを返すので、ステータスバーに反映する。

- **`crossProfileTaskOperator` のスタブ**: `MoveTaskBetweenProfilesUseCase` の
  `crossProfileTaskOperator` は現在スタブ（`async () => undefined`）。
  実際のクロスDB操作はこのタスクの別フェーズで実装する（今回は対象外）。
