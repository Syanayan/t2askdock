# DBプロファイル マウント管理 実装タスク

> 目的: 詳細設計書 v0.3 の追加仕様（マウント管理ユースケース群・SecretStorage 統合・OS権限チェック）を実装する。

---

## 背景・現状

コミット `5c8512387b` で詳細設計書が v0.2 → v0.3 に更新された。
以下が新たに設計された内容であり、コードはまだ存在しない。

| 追加要素 | 場所 |
|---------|------|
| `DatabaseProfile.mountSource / accessAllowed` フィールド | `DETAILED_DESIGN.md` §3.1 |
| `path` の OS アクセス権バリデーション | §3.2 |
| `SwitchDatabaseProfileUseCase` OSチェック挿入（step 2） | §4.4 |
| `MountDatabaseUseCase` / `UnmountDatabaseUseCase` | §4.4 |
| `RegisterDatabaseDirectoryUseCase` / `ScanDatabaseDirectoryUseCase` | §4.4 |
| `MoveTaskBetweenProfilesUseCase` | §4.4 |
| SecretStorage によるマウント一覧・アクセスキー保存 | §4.4 DB Mount Metadata |
| `db_profiles.mount_source` カラム | §6 スキーマ |

### 現在の実装状態

- `DatabaseProfileRecord` 型: `profileId / name / path / mode / encryptedDek / dekWrapSalt` のみ
- `DatabaseProfileRepository`: `findById / setMode / save` のみ
- `db_profiles` テーブル: `mount_source` カラムなし（マイグレーション未追加）
- `SwitchDatabaseProfileUseCase`: OS アクセス権チェックなし
- 上記新ユースケースはすべて未実装
- `SecretStorage` 統合なし

---

## グループ A: DB スキーマ更新

- [ ] **A-1 `mount_source` カラム追加（マイグレーション）**

  **ファイル**: `src/infra/sqlite/migrations/initial-migration-v1.ts`

  `CREATE TABLE IF NOT EXISTS db_profiles` に以下を追加する:

  ```sql
  mount_source TEXT NOT NULL CHECK(mount_source IN ('individual','directory')) DEFAULT 'individual',
  ```

  既存テーブルへの後付け追加の場合は `ALTER TABLE db_profiles ADD COLUMN ...` を用いた
  v2 マイグレーションファイル (`initial-migration-v2.ts`) を作成し、マイグレーション実行
  ロジック（`src/infra/sqlite/` 配下）でバージョン管理すること。

---

## グループ B: `DatabaseProfileRecord` 型・Repository 拡張

- [ ] **B-1 型定義の拡張**

  **ファイル**: `src/infra/sqlite/repositories/database-profile-repository.ts`

  `DatabaseProfileRecord` に以下のフィールドを追加する:

  ```ts
  isDefault: boolean;
  lastConnectedAt: string | null;
  mountSource: 'individual' | 'directory';
  accessAllowed: boolean;
  ```

- [ ] **B-2 `findById` を新フィールド対応に更新**

  SELECT に `is_default`, `last_connected_at`, `mount_source` を追加し、
  `access_allowed` は「現在の OS 権限チェック結果」ではなく DB の永続値として扱う。

  ```sql
  SELECT profile_id       AS profileId,
         name             AS name,
         path             AS path,
         mode             AS mode,
         is_default       AS isDefault,
         last_connected_at AS lastConnectedAt,
         mount_source     AS mountSource,
         encrypted_dek    AS encryptedDek,
         dek_wrap_salt    AS dekWrapSalt
    FROM db_profiles
   WHERE profile_id = ?
  ```

  `accessAllowed` は固定 `true`（DBにカラムなし）として返し、
  実際の権限確認はユースケース層のポートで行う。

- [ ] **B-3 `save` を新フィールド対応に更新**

  INSERT 文に `mount_source` を追加。`is_default`・`last_connected_at` も保存できるよう修正する。

- [ ] **B-4 `findAll(): Promise<DatabaseProfileRecord[]>` を追加**

  `ScanDatabaseDirectoryUseCase` と `RegisterDatabaseDirectoryUseCase` で必要。

- [ ] **B-5 `delete(profileId: string): Promise<void>` を追加**

  `UnmountDatabaseUseCase` で使用。

---

## グループ C: OS ファイルアクセス権チェック（共通ポート）

- [ ] **C-1 `OsFileAccessChecker` ポートを定義**

  **ファイル**: `src/core/ports/services/os-file-access-checker.ts`（新規作成）

  ```ts
  export type OsFileAccessResult = {
    exists: boolean;
    readable: boolean;
    writable: boolean;
  };

  export interface OsFileAccessChecker {
    check(filePath: string): Promise<OsFileAccessResult>;
    checkDirectory(dirPath: string): Promise<{ exists: boolean; readable: boolean }>;
    listSqliteFiles(dirPath: string): Promise<string[]>;
  }
  ```

- [ ] **C-2 Node.js アダプタを実装**

  **ファイル**: `src/infra/node/node-os-file-access-checker.ts`（新規作成）

  `fs.access` を使って読み取り (`fs.constants.R_OK`) と書き込み (`fs.constants.W_OK`) を確認する。
  `listSqliteFiles` は `fs.readdir` で `.sqlite` / `.db` 拡張子を列挙する。

- [ ] **C-3 `SwitchDatabaseProfileUseCase` に OS アクセス権チェックを追加**

  **ファイル**: `src/core/usecase/db/switch-database-profile-usecase.ts`

  設計書 §4.4 に従い、処理ステップに以下を挿入する（ステップ2）:

  ```
  1. プロファイル存在確認
  2. OSファイルアクセス権確認（読み書き可能でなければ ERROR_CODES.ACCESS_DENIED を throw）
  3. 認証状態確認（未認証ならキー入力導線へ）
  4. 接続テスト
  5. 成功時 activeProfile 更新
  ```

  コンストラクタに `OsFileAccessChecker` を追加し、`check(profile.path)` を呼ぶ。

- [ ] **C-4 `SwitchDatabaseProfileUseCase` のテスト更新**

  **ファイル**: `test/unit/switch-database-profile-usecase.spec.ts`（既存）

  - OS チェック失敗時に `ACCESS_DENIED` エラーが throw されることを確認するケースを追加。

---

## グループ D: `MountDatabaseUseCase` / `UnmountDatabaseUseCase`

- [ ] **D-1 `MountDatabaseUseCase` を実装**

  **ファイル**: `src/core/usecase/db/mount-database-usecase.ts`（新規作成）

  ```ts
  type MountDatabaseInput = {
    path: string;
    name: string;
    mode: 'readWrite' | 'readOnly';
    actorRole: 'admin' | 'general';
  };
  type MountDatabaseOutput = {
    profileSummary: { profileId: string; name: string; path: string; mountSource: 'individual' };
  };
  ```

  処理:
  1. `actorRole !== 'admin'` なら `ERROR_CODES.FORBIDDEN` を throw
  2. `OsFileAccessChecker.check(path)` で存在・権限を確認
  3. SQLite 暗号化/DEK 復号の簡易検証（既存 `ConnectionHealthChecker` を利用可）
  4. `DatabaseProfileRepository.save(...)` で `mountSource = 'individual'` として登録
  5. `SecretStorageService.saveMountKey(profileId, ...)` でアクセスキー情報を保持

- [ ] **D-2 `UnmountDatabaseUseCase` を実装**

  **ファイル**: `src/core/usecase/db/unmount-database-usecase.ts`（新規作成）

  ```ts
  type UnmountDatabaseInput = { profileId: string; actorRole: 'admin' | 'general' };
  ```

  処理:
  1. `actorRole !== 'admin'` なら `ERROR_CODES.FORBIDDEN` を throw
  2. `DatabaseProfileRepository.delete(profileId)`
  3. `SecretStorageService.deleteMountKey(profileId)`

- [ ] **D-3 `MountDatabaseUseCase` / `UnmountDatabaseUseCase` のテスト**

  **ファイル**: `test/unit/mount-database-usecase.spec.ts`（新規作成）

  テスト項目:
  - admin 以外が mount を試みると `FORBIDDEN` エラー
  - OS チェック失敗（ファイルなし）時に `FILE_NOT_FOUND` エラー
  - 正常マウント時に `DatabaseProfileRepository.save` と `SecretStorageService.saveMountKey` が呼ばれる
  - 正常アンマウント時に `delete` と `deleteMountKey` が呼ばれる

---

## グループ E: `RegisterDatabaseDirectoryUseCase` / `ScanDatabaseDirectoryUseCase`

- [ ] **E-1 `RegisterDatabaseDirectoryUseCase` を実装**

  **ファイル**: `src/core/usecase/db/register-database-directory-usecase.ts`（新規作成）

  ```ts
  type RegisterDatabaseDirectoryInput = {
    directoryPath: string;
    actorRole: 'admin' | 'general';
  };
  type RegisterDatabaseDirectoryOutput = {
    registeredProfiles: Array<{ profileId: string; path: string }>;
  };
  ```

  処理:
  1. `actorRole !== 'admin'` なら `FORBIDDEN`
  2. `OsFileAccessChecker.checkDirectory(directoryPath)` でディレクトリ存在確認
  3. `OsFileAccessChecker.listSqliteFiles(directoryPath)` で SQLite ファイルを列挙
  4. 各ファイルに対し `MountDatabaseUseCase` 相当の検証（権限・暗号化チェック）を実行
  5. `DatabaseProfileRepository.save(...)` で `mountSource = 'directory'` として一括登録
  6. `SecretStorageService.saveDirectoryRegistration(directoryPath)` に保存

- [ ] **E-2 `ScanDatabaseDirectoryUseCase` を実装**

  **ファイル**: `src/core/usecase/db/scan-database-directory-usecase.ts`（新規作成）

  ```ts
  type ScanDatabaseDirectoryOutput = {
    scanResult: {
      added: string[];
      removed: string[];
      permissionChanged: string[];
    };
  };
  ```

  処理:
  1. `DatabaseProfileRepository.findAll()` から `mountSource = 'directory'` を抽出
  2. 各 path を `OsFileAccessChecker.check(path)` で再スキャン
  3. 追加/削除/権限変化を検知し差分を返す
  4. UIイベント `DATABASE_DIRECTORY_UPDATED` を `UiEventBus.publish(...)` で通知

- [ ] **E-3 `DATABASE_DIRECTORY_UPDATED` イベントを `UiEventBus` に追加**

  **ファイル**: `src/ui/events/ui-event-bus.ts`（既存）

  ```ts
  | { type: 'DATABASE_DIRECTORY_UPDATED'; payload: { added: string[]; removed: string[]; permissionChanged: string[] } }
  ```

- [ ] **E-4 ディレクトリ管理ユースケースのテスト**

  **ファイル**: `test/unit/register-database-directory-usecase.spec.ts`（新規作成）

  テスト項目:
  - admin 以外が登録しようとすると `FORBIDDEN`
  - ディレクトリが存在しない場合にエラー
  - SQLite ファイルが3件あれば3件のプロファイルが登録される
  - `ScanDatabaseDirectoryUseCase` でファイルが削除されると `removed` に含まれ、イベントが発火する

---

## グループ F: `MoveTaskBetweenProfilesUseCase`

- [ ] **F-1 `MoveTaskBetweenProfilesUseCase` を実装**

  **ファイル**: `src/core/usecase/db/move-task-between-profiles-usecase.ts`（新規作成）

  ```ts
  type MoveTaskBetweenProfilesInput = {
    taskId: string;
    sourceProfileId: string;
    targetProfileId: string;
    expectedVersion: number;
    copyMode: boolean;
    actorRole: 'admin' | 'general';
    actorId: string;
    now: string;
  };
  type MoveTaskBetweenProfilesOutput = {
    taskMigrationSummary: {
      taskId: string;
      sourceProfileId: string;
      targetProfileId: string;
      copied: boolean;
    };
  };
  ```

  処理:
  1. source/target プロファイルの両方が `DatabaseProfileRepository.findById` で取得できること
  2. `connectionMode === 'READ_WRITE'` であること（READ_ONLY なら `ERROR_CODES.READ_ONLY_MODE` を throw）
  3. `actorRole !== 'admin'` かつ両プロファイルの編集権限がない場合は `FORBIDDEN`
  4. source DB からタスク・関連タグ・コメントを読み込む
  5. target DB にタスク・タグ・コメントを保存
  6. `copyMode = false` の場合は source DB のタスクを論理削除（`deleted_at = now` または移動フラグ）
  7. 監査ログ `TASK_MOVED_ACROSS_DB` を記録

- [ ] **F-2 監査ログ `TASK_MOVED_ACROSS_DB` を `actionType` として定義**

  `src/core/ports/repositories/audit-log-repository.ts` または `error-codes.ts` 等の
  定数定義箇所に `'TASK_MOVED_ACROSS_DB'` を追加する。

- [ ] **F-3 `MoveTaskBetweenProfilesUseCase` のテスト**

  **ファイル**: `test/unit/move-task-between-profiles-usecase.spec.ts`（新規作成）

  テスト項目:
  - source プロファイルが存在しない場合にエラー
  - READ_ONLY 接続時は `READ_ONLY_MODE` エラー
  - `copyMode = false` で移動後に source タスクが論理削除される
  - `copyMode = true` で移動後に source タスクが残る
  - 監査ログに `TASK_MOVED_ACROSS_DB` が記録される

---

## グループ G: SecretStorage 統合

- [ ] **G-1 `SecretStorageService` ポートを定義**

  **ファイル**: `src/core/ports/services/secret-storage-service.ts`（新規作成）

  ```ts
  export interface SecretStorageService {
    saveMountKey(profileId: string, keyRef: string): Promise<void>;
    deleteMountKey(profileId: string): Promise<void>;
    getMountKey(profileId: string): Promise<string | null>;
    saveDirectoryRegistration(dirPath: string): Promise<void>;
    getDirectoryRegistrations(): Promise<string[]>;
    deleteDirectoryRegistration(dirPath: string): Promise<void>;
  }
  ```

- [ ] **G-2 VSCode `SecretStorage` アダプタを実装**

  **ファイル**: `src/infra/vscode/vscode-secret-storage-service.ts`（新規作成）

  `vscode.ExtensionContext.secrets` を利用し `SecretStorageService` を実装する。
  キーの名前空間は `t2askdock.mountKey.<profileId>` / `t2askdock.dirRegistrations` とする。

- [ ] **G-3 起動時の SecretStorage 復元**

  **ファイル**: `src/extension.ts`

  `activate` 時に `SecretStorageService.getDirectoryRegistrations()` を呼び、
  登録済みディレクトリに対して `ScanDatabaseDirectoryUseCase.execute()` を実行して
  プロファイル一覧を最新化する。

- [ ] **G-4 DI 配線**

  **ファイル**: `src/core/di/container.ts`

  `VscodeSecretStorageService` を DI コンテナに登録し、各ユースケースに注入する。

---

## 実装順序

```
A-1（スキーマ）
→ B-1 → B-2 → B-3 → B-4 → B-5（Repository）
→ C-1 → C-2（OS チェックポート）
→ C-3 → C-4（SwitchUseCase 更新）
→ G-1 → G-2（SecretStorage ポート）
→ D-1 → D-2 → D-3（Mount/Unmount）
→ E-1 → E-2 → E-3 → E-4（Directory 管理）
→ F-1 → F-2 → F-3（MoveTask）
→ G-3 → G-4（起動時復元・DI 配線）
```

---

## 技術上の注意点

- **クロス DB 操作（F-1）**: source/target が異なる SQLite ファイルを指す場合、
  トランザクションを分けて管理し、target 書き込み成功後に source の論理削除を行うこと。
  アトミックにはならないため、監査ログに両操作を記録して補償できるようにする。

- **`OsFileAccessChecker` は副作用があるためテストではモック**: Node.js アダプタを
  インターフェースで分離しているため、テストでは `{ check: jest.fn() }` 等のスタブに差し替える。

- **`mount_source` カラムの DEFAULT 値**: 既存レコードへのマイグレーションでは
  `DEFAULT 'individual'` で補完されるため、既存プロファイルへの影響はない。

- **SecretStorage はローカルホスト固有**: `db_profiles` はプロジェクト DB に含まれるが、
  SecretStorage のキー参照は VSCode のローカル設定に格納される。
  チーム共有 DB 内には機密情報を書かないこと。

- **`listSqliteFiles` の対象拡張子**: `.sqlite` / `.sqlite3` / `.db` の3種類を対象とする。
  `.db` は汎用すぎるため、ファイルヘッダー（`SQLite format 3\000`）で確認することが望ましい。
