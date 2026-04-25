# 詳細設計書 v0.2
## VS Code拡張機能：オフライン共有タスク管理ツール

- 作成日: 2026-04-25
- 対象基本設計: `BASIC_DESIGN.md` v0.3
- 対象要求仕様: `REQUIREMENTS.md` v1.3
- 開発方式: TDD（Red → Green → Refactor）

---

## 1. 目的と適用範囲

本書は、基本設計で定義したアーキテクチャ/機能を実装可能な粒度に落とし込むための詳細設計である。対象は以下。

- ドメインモデルの具象仕様（型、制約、バリデーション）
- ユースケース入出力、エラー、トランザクション境界
- SQLiteスキーマ定義（DDL）、インデックス、マイグレーション
- VS Code拡張ポイント実装設計（View/Command/StatusBar）
- セキュリティ、監査、バックアップ、競合解決の実装仕様
- テスト設計（ユニット/統合/E2E）

---

## 2. 実装ディレクトリ構成

```text
src/
  core/
    domain/
      entities/
      valueObjects/
      services/
      errors/
    usecase/
      task/
      comment/
      auth/
      permission/
      conflict/
      audit/
      profile/
      backup/
    ports/
      repositories/
      services/
  infra/
    sqlite/
      migrations/
      repositories/
      tx/
      triggers/
    security/
      keyVault/
      kdf/
      crypto/
    audit/
    networkfs/
    backup/
  ui/
    commands/
    tree/
    board/
    comment/
    admin/
    statusbar/
    webview/
  connectors/
    shared/
    github/
    gitlab/
```

補足:
- `core` は VS Code API に依存しない。
- `ui` は `usecase` のみ参照し、`infra` 実装型を直接参照しない（DIで注入）。

---

## 3. ドメイン詳細設計

## 3.1 エンティティ型定義（TypeScript）

```ts
type Role = 'admin' | 'general';
type UserStatus = 'active' | 'disabled';
type OwnerType = 'user' | 'device';
type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
type Priority = 'low' | 'medium' | 'high' | 'critical';

interface User {
  userId: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  createdAt: string; // ISO8601
  updatedAt: string;
}

interface Task {
  taskId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee: string | null;
  dueDate: string | null; // YYYY-MM-DD
  tags: string[];
  parentTaskId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface Comment {
  commentId: string;
  taskId: string;
  body: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}
```

### 3.2 バリデーション規約

- ID: ULID採用（26文字、時系列ソート可）
- `title`: 1〜200文字、前後空白除去後に判定
- `description`: 0〜5000文字
- `tags`: 1要素あたり1〜32文字、最大20個、重複不可（case-insensitive）
- `dueDate`: `YYYY-MM-DD` 形式、1900-01-01〜2100-12-31
- `version`: 1以上（新規作成時は1）
- `comment.body`: 1〜4000文字、改行可、Markdown許容（scriptタグは保存時除去）

### 3.3 ドメインサービス

1. `AuthorizeTaskEditPolicy`
   - 入力: `currentUser`, `task`, `projectPermissionGrant[]`, `connectionMode`
   - 出力: `AuthorizationResult`（allow/deny + reasonCode）
   - deny条件優先度:
     1. ReadOnly接続
     2. user.status != active
     3. role != admin かつ 編集許可条件不一致

2. `ConflictDetector`
   - 入力: `expectedVersion`, `persistedVersion`
   - 出力: `isConflict`, `conflictType(VersionMismatch|Deleted)`

3. `AccessKeyPolicy`
   - 判定: 失効、有効期限、用途制約（user/device）

---

## 4. ユースケース詳細設計

## 4.1 共通I/O契約

```ts
interface UseCaseContext {
  requestId: string;
  actorId: string;
  actorRole: 'admin' | 'general';
  profileId: string;
  connectionMode: 'READ_WRITE' | 'READ_ONLY';
  now: Date;
}

interface UseCaseResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    detail?: unknown;
  };
}
```

### 4.2 タスク系

#### CreateTaskUseCase
- 入力: `projectId, title, description, priority, assignee, dueDate, tags, parentTaskId`
- 事前条件:
  - 認証済み
  - ReadWrite
  - プロジェクト閲覧権限あり
- 事後処理:
  - `tasks` insert
  - `audit_logs` insert (`TASK_CREATED`)
- 想定エラー:
  - `E_READ_ONLY_MODE`
  - `E_VALIDATION_FAILED`
  - `E_PROJECT_NOT_FOUND`
  - `E_PERMISSION_DENIED`

#### UpdateTaskUseCase
- 入力: `taskId`, 更新対象フィールド群, `expectedVersion`
- 事前条件:
  - 編集権限あり
  - ReadWrite
- 処理:
  1. 現在レコード読み取り
  2. 権限評価
  3. `version` 一致確認
  4. 差分適用 + `version = version + 1`
  5. 監査ログ記録
- 想定エラー:
  - `E_TASK_CONFLICT`
  - `E_PERMISSION_DENIED`
  - `E_READ_ONLY_MODE`

#### MoveTaskStatusUseCase
- 入力: `taskId`, `toStatus`, `expectedVersion`
- 補足:
  - BoardのD&D専用。内部的には `UpdateTaskUseCase` を呼び出して一元化。

### 4.2.1 コメント系

#### AddTaskCommentUseCase
- 入力: `taskId`, `body`
- 事前条件:
  - タスク閲覧権限あり
  - ReadWrite
- 処理:
  1. タスク存在確認
  2. bodyバリデーション/サニタイズ
  3. `comments` insert
  4. `audit_logs` insert (`TASK_COMMENT_ADDED`)

#### UpdateTaskCommentUseCase
- 入力: `commentId`, `body`, `expectedVersion`
- 制約:
  - 作成者本人または管理者のみ更新可
  - 論理削除済みコメントは更新不可
- 想定エラー:
  - `E_COMMENT_NOT_FOUND`
  - `E_COMMENT_CONFLICT`
  - `E_PERMISSION_DENIED`

#### DeleteTaskCommentUseCase
- 物理削除禁止。`deleted_at` を設定する論理削除のみ許可。
- 監査ログ: `TASK_COMMENT_DELETED`

#### ListTaskCommentsUseCase
- ソート: `created_at ASC`
- 既定で `deleted_at IS NULL` のみ返却（管理者は `includeDeleted=true` 指定可）

### 4.3 認証/権限系

#### AuthenticateAccessKeyUseCase
- 入力: `rawAccessKey`, `targetProfileId`, `deviceFingerprint`
- 処理:
  1. `access_keys` から有効候補取得
  2. Argon2idで照合
  3. 成功時 `kdf.deriveKEK()` 実行
  4. `encrypted_dek` 復号
  5. DB接続セッション発行
- 失敗時監査:
  - `AUTH_FAILED` を記録（理由コード付き）

#### GrantProjectEditPermissionUseCase
- 管理者限定
- 入力: `projectId`, `userId`, `canEdit`
- 制約: 同一 `projectId-userId` の有効grantは常に1件
- 失効仕様:
  - 取り消しは `revoked_at` 更新のみ（履歴保持）
  - 期限付き許可は `expires_at` 到達で自動失効扱い

### 4.4 DBプロファイル/接続系

#### SwitchDatabaseProfileUseCase
- 入力: `profileId`
- 処理:
  1. プロファイル存在確認
  2. 認証状態確認（未認証ならキー入力導線へ）
  3. 接続テスト（暗号化、ロック診断）
  4. 成功時 `activeProfile` 更新 + UIイベント通知
- 出力: `profileSummary`, `connectionMode`, `healthStatus`

#### SetReadOnlyModeUseCase
- 入力: `enabled: boolean`
- 制約:
  - 一般ユーザーは `true` への切替のみ許可
  - `false` への復帰は管理者または接続健全化の自動復帰のみ

### 4.5 競合解決系

#### DetectTaskConflictUseCase
- 入力: `taskId`, `expectedVersion`
- 出力:
  - `isConflict`
  - `currentTask`
  - `proposedDiff`

#### ResolveTaskConflictUseCase
- 入力: `taskId`, `policy`, `manualPatch?`
- policy:
  - `LOCAL_WIN`
  - `REMOTE_WIN`
  - `MANUAL_MERGE`
- 監査ログ:
  - `TASK_CONFLICT_RESOLVED` + policy + diff summary

### 4.6 機能フラグ/コネクタ設定系

#### SetFeatureFlagUseCase
- 管理者限定
- 入力: `flagKey`, `enabled`, `scopeType`, `scopeId?`
- 監査ログ: `FEATURE_FLAG_UPDATED`

#### UpdateConnectorSettingUseCase
- 管理者限定
- 入力: `connectorId`, `profileId`, `enabled`, `authType`, `settingsJson`, `syncPolicy`
- `ConnectorProvider.validateConfig` に成功した場合のみ保存
- 監査ログ: `CONNECTOR_SETTINGS_UPDATED`

---

## 5. 永続化詳細設計（SQLite/SQLCipher）

## 5.1 DDL（初期マイグレーション v1）

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','general')),
  status TEXT NOT NULL CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('todo','in_progress','done','blocked')),
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high','critical')),
  assignee TEXT,
  due_date TEXT,
  parent_task_id TEXT REFERENCES tasks(task_id),
  created_by TEXT NOT NULL REFERENCES users(user_id),
  updated_by TEXT NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1)
);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(task_id, tag)
);

CREATE TABLE comments (
  comment_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_id),
  updated_by TEXT NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  deleted_at TEXT
);

CREATE TABLE project_permissions (
  grant_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  can_edit INTEGER NOT NULL CHECK(can_edit IN (0,1)),
  granted_by TEXT NOT NULL REFERENCES users(user_id),
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX ux_perm_project_user_active
  ON project_permissions(project_id, user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE access_keys (
  key_id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('user','device')),
  issued_for TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_salt TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  issued_by TEXT NOT NULL REFERENCES users(user_id),
  issued_at TEXT NOT NULL
);

CREATE TABLE db_profiles (
  profile_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('readWrite','readOnly')),
  is_default INTEGER NOT NULL DEFAULT 0,
  last_connected_at TEXT,
  encrypted_dek BLOB NOT NULL,
  dek_wrap_salt TEXT NOT NULL
);

CREATE TABLE profile_key_wrappers (
  profile_id TEXT NOT NULL REFERENCES db_profiles(profile_id) ON DELETE CASCADE,
  key_id TEXT NOT NULL REFERENCES access_keys(key_id) ON DELETE CASCADE,
  encrypted_dek BLOB NOT NULL,
  wrap_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(profile_id, key_id)
);

CREATE TABLE audit_logs (
  log_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload_diff_json TEXT NOT NULL,
  retention_class TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_log_archive (
  archive_id TEXT PRIMARY KEY,
  bucket_ym TEXT NOT NULL,
  compressed_payload BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE backup_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES db_profiles(profile_id),
  file_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  generation INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  scope_type TEXT NOT NULL CHECK(scope_type IN ('global','profile','user')),
  scope_id TEXT,
  updated_by TEXT NOT NULL REFERENCES users(user_id),
  updated_at TEXT NOT NULL
);

CREATE TABLE connector_settings (
  connector_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES db_profiles(profile_id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  auth_type TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  secret_ref TEXT,
  sync_policy TEXT NOT NULL CHECK(sync_policy IN ('manual','scheduled')),
  updated_by TEXT NOT NULL REFERENCES users(user_id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(connector_id, profile_id)
);

CREATE TRIGGER trg_task_tags_limit_insert
BEFORE INSERT ON task_tags
FOR EACH ROW
WHEN (
  SELECT COUNT(*) FROM task_tags WHERE task_id = NEW.task_id
) >= 20
BEGIN
  SELECT RAISE(ABORT, 'E_TAG_LIMIT_EXCEEDED');
END;
```

### 5.2 インデックス

```sql
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX idx_tasks_project_updated ON tasks(project_id, updated_at DESC);
CREATE INDEX idx_comments_task_created ON comments(task_id, created_at ASC);
CREATE INDEX idx_comments_author_created ON comments(created_by, created_at DESC);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_actor_created ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_target_created ON audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX idx_backup_profile_created ON backup_snapshots(profile_id, created_at DESC);
CREATE INDEX idx_flags_scope ON feature_flags(scope_type, scope_id);
CREATE INDEX idx_connector_profile ON connector_settings(profile_id, connector_id);
```

### 5.3 Repository実装契約

- `TaskRepository.updateWithVersion(task, expectedVersion)`
  - SQL: `UPDATE ... WHERE task_id = ? AND version = ?`
  - 更新件数0件なら `E_TASK_CONFLICT`
- `CommentRepository.updateWithVersion(comment, expectedVersion)`
  - 更新件数0件なら `E_COMMENT_CONFLICT`
- `ProjectPermissionRepository.revoke(grantId, revokedAt, revokedBy)`
  - 物理削除せず失効更新のみ。履歴は永続保持。
- タグ上限20件は `trg_task_tags_limit_insert` とアプリ側バリデーションの二重防御で担保
- すべての更新系Repositoryは `TransactionManager.runInTx` 内で実行
- `AuditLogRepository.append` は業務更新と同一トランザクションでコミット

### 5.4 マイグレーション実行アルゴリズム

1. `SELECT MAX(version) FROM schema_version`
2. 必要マイグレーション差分を列挙
3. 管理者かつReadWriteのみ実行
4. 各マイグレーション前にDBスナップショット取得
5. 失敗時:
   - スナップショット復元
   - `READ_ONLY` で再接続
   - `MIGRATION_FAILED` 監査記録

### 5.5 タグ検索性能設計

- `task_tags` は正規化保持し、検索時は `tasks` と `task_tags` をJOIN
- 部分一致検索は `LIKE`、完全一致検索は `=` を使い分ける
- 将来拡張として `FTS5` 仮想テーブル（title/description/tag）を追加可能な設計とする

---

## 6. インフラ詳細設計

## 6.1 セキュリティ

### 6.1.1 鍵導出/復号フロー

- KDF: Argon2id
  - memoryCost: 64MB
  - iterations: 3
  - parallelism: 1
- 入力素材:
  - `rawAccessKey`
  - `deviceFingerprint`
  - `dek_wrap_salt`
- 出力: `KEK (32 bytes)`
- 復号: AES-256-GCM で `encrypted_dek` をアンラップ

### 6.1.2 SecretStorage保存項目

- `taskDock.activeProfileId`
- `taskDock.session.<profileId>.authToken`（短命、TTLあり）
- 生キー保存禁止（rawAccessKeyは保持しない）

### 6.1.3 DEK生成/再ラップ仕様

- DB初期化時（管理者のみ）
  1. CSPRNGで `DEK`(32 bytes) を生成
  2. `dek_wrap_salt`(16 bytes) を生成
  3. 管理者キーから導出した `KEK` で `DEK` をAES-256-GCMでラップ
  4. `db_profiles.encrypted_dek` に保存
- キー再発行/失効時
  - `DEK` 自体は再生成しない（データ再暗号化コスト回避）
  - 有効キー集合で `KEK` 再導出を行い再ラップし、旧ラップ情報を無効化
- 複数キー/複数端末
  - `profile_key_wrappers(profile_id, key_id, encrypted_dek, wrap_salt, created_at, revoked_at)` を保持
  - 認証キーに対応するラッパーでのみDEK復号を許可

### 6.1.4 セッション/認証ライフサイクル

- `authToken` TTL: 8時間（既定）、アイドル30分で失効
- 更新条件: 操作時に残TTL < 15分ならローリング更新
- 強制失効条件:
  - キー失効イベント受信
  - キー期限切れ検出
  - プロファイル切替
  - 拡張再起動時のTTL超過
- 期限切れキー検出時:
  - 既存セッションは即時 `AUTH_EXPIRED` 状態へ遷移
  - 変更系UseCaseを拒否し、再認証ダイアログを強制表示

## 6.2 NetworkFS Safety Guard

- 起動時チェック
  1. パス種別判定（local/smb/nfs/unknown）
  2. ロック自己診断（BEGIN IMMEDIATE→ROLLBACK）
  3. RTT簡易測定（3回）
- 判定レベル
  - `HEALTHY`: 平均RTT <= 80ms かつ ロック診断失敗0回
  - `DEGRADED`: 平均RTT 81〜250ms または ロック診断失敗1回
  - `UNSAFE`: 平均RTT > 250ms または ロック診断失敗2回以上

## 6.3 Retry/障害制御

- 対象エラー: `SQLITE_BUSY`, `SQLITE_IOERR`, 一時ネットワーク断
- backoff: 200ms, 400ms, 800ms, 1600ms（最大4回）
- 連続3トランザクション失敗で `CONNECTION_DEGRADED`、連続5失敗で `UNSAFE` へ遷移

## 6.4 バックアップ

- 方式: SQLite Online Backup API
- トリガ:
  - 手動実行（管理者）
  - 重要操作前（migration/restore/conflict manual merge）
  - 日次定期（拡張起動時に前回実行日確認）
- 世代: 日次7 + 週次4 + 月次3
- ローテーション:
  - 新規作成成功後に世代超過分を古い順に自動削除
  - 削除結果は `BACKUP_ROTATED` として監査記録

---

## 7. VS Code UI詳細設計

## 7.1 package contributions（抜粋）

- `viewsContainers.activitybar`
  - id: `taskDock`
- `views`
  - `taskDock.treeView`
  - `taskDock.boardView`
  - `taskDock.auditView`
  - `taskDock.dbProfilesView`
- `commands`
  - `taskDock.openTree`
  - `taskDock.openBoard`
  - `taskDock.selectDatabase`
  - `taskDock.toggleReadOnly`
  - `taskDock.createTask`
  - `taskDock.manageAccessKeys`
  - `taskDock.grantProjectPermission`
  - `taskDock.restoreBackup`

## 7.2 画面コンポーネント

1. `TreeViewProvider`
   - ノード種別: ProjectNode / TaskNode / SubTaskNode
   - 遅延ロード + ページング（既定100件）

2. `BoardWebviewPanel`
   - 列: todo/in_progress/blocked/done
   - D&D終了イベントで `MoveTaskStatusUseCase`
   - 競合時は `ConflictResolveModal` を呼び出し
   - タスク選択時に `CommentThreadPanel` を右サイドに表示

3. `AdminConsolePanel`
   - タブ: AccessKey / Permission / Backup / Audit / FeatureFlag / Connector
   - 非管理者は読み取り専用表示

4. `CommentThreadPanel`
   - 表示: コメント時系列（created_at昇順）
   - 操作: 追加・編集・論理削除（権限制御）
   - 差分競合時は `E_COMMENT_CONFLICT` で再読込を促す

5. `StatusBarController`
   - 左: `DB:<profileName>`
   - 左: `Mode:RW|RO`
   - 左: `Health:Healthy|Degraded|Unsafe`
   - `Unsafe` 時は警告色 + `Reconnect` コマンドリンク表示

6. `ArchiveAuditSearchPanel`
   - 既定検索は `audit_logs`
   - 期間が90日超の場合、自動で `audit_log_archive` も横断検索
   - 結果に「オンライン/アーカイブ」バッジを表示

## 7.3 UI状態管理

- `ExtensionStateStore`（メモリ）
  - `activeProfile`
  - `connectionMode`
  - `healthStatus`
  - `currentUser`
- イベントバス
  - `PROFILE_SWITCHED`
  - `MODE_CHANGED`
  - `TASK_UPDATED`
  - `CONFLICT_DETECTED`
  - `AUTH_EXPIRED`
  - `CONNECTION_HEALTH_CHANGED`
  - `ARCHIVE_SEARCH_COMPLETED`

---

## 8. 主要シーケンス

## 8.1 タスク更新

1. UIから編集確定
2. `UpdateTaskUseCase.execute`
3. `AuthorizeTaskEditPolicy.evaluate`
4. Repository `updateWithVersion`
5. 0件更新なら `E_TASK_CONFLICT`
6. 監査ログ追加
7. UIイベント `TASK_UPDATED`

## 8.2 DB切替

1. Command `taskDock.selectDatabase`
2. `SwitchDatabaseProfileUseCase`
3. 未認証ならキー入力
4. 認証後に接続テスト
5. 成功時、Tree/Board再描画
6. 失敗時、RO再試行提案

## 8.3 監査アーカイブ（日次）

1. scheduler起動
2. 90日超レコード抽出
3. 月単位で圧縮バンドル生成
4. `audit_log_archive` 保存
5. 元データを `audit_logs` から移送
6. `AUDIT_ARCHIVED` 監査記録

## 8.4 ReadOnly遷移/復帰

1. `CONNECTION_DEGRADED` または `UNSAFE` 検出
2. `SetReadOnlyModeUseCase(true)` 実行
3. UIは編集操作を無効化し、`Reconnect` ボタンを表示
4. `Reconnect` 実行時:
   - 健全性チェック（ロック診断 + RTT再計測）
   - 成功時のみ管理者確認後 `SetReadOnlyModeUseCase(false)`
   - 失敗時はRO継続 + 次回再試行時刻を表示

## 8.5 Connector/Feature Flag適用フロー

1. 拡張起動時に `feature_flags` をロード
2. `connector.<id>.enabled` が true のProviderのみDI登録
3. `connector_settings` を profile単位で読み込み、`validateConfig()` 実行
4. 無効/不正設定Providerは初期化スキップし `CONNECTOR_SETTINGS_UPDATED` を監査記録
5. 同期実行は `sync_policy=manual` の場合のみコマンド起動で実行

## 8.6 ConnectorProvider詳細契約

```ts
interface ConnectorProvider {
  id: string;
  supportsOfflineQueue: boolean;
  validateConfig(config: ConnectorSetting): Promise<void>;
  pull(ctx: SyncContext): Promise<SyncResult>;
  push(ctx: SyncContext, changes: DomainChangeSet): Promise<SyncResult>;
  dryRun(changes: DomainChangeSet): Promise<PreviewResult>;
}
```

- `dryRun` は「提案→承認→反映」の承認前チェックに必須
- Provider実装は `core` へ依存不可。`connectors/shared` の契約型のみ利用可
- Feature FlagがOFFの場合は `validateConfig` を含め一切呼び出さない

---

## 9. エラーコード設計

| code | 意味 | UI挙動 |
|---|---|---|
| E_AUTH_FAILED | アクセスキー認証失敗 | 再入力ダイアログ |
| E_KEY_EXPIRED | キー期限切れ | 管理者連絡ガイド表示 |
| E_PERMISSION_DENIED | 権限不足 | 操作拒否トースト |
| E_READ_ONLY_MODE | RO中の更新操作 | ROバナー誘導 |
| E_TASK_CONFLICT | 競合発生 | 競合解決ダイアログ |
| E_COMMENT_CONFLICT | コメント競合 | コメント再読込通知 |
| E_COMMENT_NOT_FOUND | コメント未存在/削除済み | 一覧再取得 |
| E_DB_LOCK_UNSAFE | ロック安全性不足 | RO強制 + 警告 |
| E_DB_CORRUPT | DB破損検知 | 復元ガイド表示 |
| E_MIGRATION_REQUIRED | スキーマ不整合 | 管理者で再接続案内 |
| E_BACKUP_RESTORE_FAILED | 復元失敗 | 復元ログ表示 |
| E_AUDIT_ARCHIVE_FAILED | 監査アーカイブ失敗 | 管理者アラート表示 |

---

## 10. 監査ログ詳細

## 10.1 action_type一覧（初期）

- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_DELETED`
- `TASK_CLONED`
- `TASK_COMMENT_ADDED`
- `TASK_COMMENT_UPDATED`
- `TASK_COMMENT_DELETED`
- `TASK_CONFLICT_DETECTED`
- `TASK_CONFLICT_RESOLVED`
- `AUTH_SUCCESS`
- `AUTH_FAILED`
- `ACCESS_KEY_ISSUED`
- `ACCESS_KEY_REVOKED`
- `ACCESS_KEY_REISSUED`
- `PROFILE_SWITCHED`
- `READ_ONLY_ENABLED`
- `READ_ONLY_DISABLED`
- `BACKUP_CREATED`
- `BACKUP_RESTORED`
- `BACKUP_ROTATED`
- `MIGRATION_APPLIED`
- `MIGRATION_FAILED`
- `AUDIT_ARCHIVED`
- `AUDIT_ARCHIVE_FAILED`
- `FEATURE_FLAG_UPDATED`
- `CONNECTOR_SETTINGS_UPDATED`

## 10.2 payload_diff_json仕様

```json
{
  "before": { "status": "todo", "assignee": "u1" },
  "after":  { "status": "in_progress", "assignee": "u2" },
  "meta": {
    "requestId": "01J...",
    "source": "board_dnd",
    "policy": "MANUAL_MERGE"
  }
}
```

## 10.3 アーカイブ検索仕様

- 検索期間が `now - 90日` を超える場合:
  1. `audit_logs` を通常検索
  2. `audit_log_archive` から該当 `bucket_ym` を展開して検索
  3. 結果を `created_at DESC` でマージ
- 応答時間対策:
  - 1回の検索で展開するアーカイブは最大6か月分
  - 超過時は月単位ページングをUIで要求

---

## 11. テスト詳細設計（TDD）

## 11.1 ユニットテスト

- `AuthorizeTaskEditPolicy.spec.ts`
  - adminは常に編集可
  - general + assignee一致で編集可
  - general + 非一致 + grantなしで拒否
  - ReadOnly時は常に拒否

- `ConflictDetector.spec.ts`
  - version一致: conflict false
  - version不一致: conflict true

- `AccessKeyPolicy.spec.ts`
  - revoked/expired/owner mismatch検証

## 11.2 ユースケーステスト

- `UpdateTaskUseCase.spec.ts`
  - 正常更新でversionインクリメント
  - expectedVersion不一致で `E_TASK_CONFLICT`
  - 監査ログが同一Txで作成される

- `AddTaskCommentUseCase.spec.ts`
  - 正常追加で監査ログ記録
  - RO時に `E_READ_ONLY_MODE`

- `SessionLifecycle.spec.ts`
  - TTL満了で `AUTH_EXPIRED`
  - キー失効イベントで強制失効

- `SwitchDatabaseProfileUseCase.spec.ts`
  - 正常切替
  - 未認証時に認証導線イベント
  - unsafe判定時にRO切替

## 11.3 インフラ統合テスト

- SQLCipher接続 + migrate + CRUD
- `SQLITE_BUSY` リトライ成功
- バックアップ作成/復元整合性
- タグ上限トリガ `E_TAG_LIMIT_EXCEEDED`
- `audit_log_archive` 横断検索の整合性

## 11.4 E2E（VS Code）

- Command PaletteからTree/Board表示
- Board D&Dで状態更新
- 競合発生→解決ダイアログ→保存
- ROモード時に編集UI無効化

---

## 12. 受入基準トレーサビリティ（詳細）

| 受入観点 | 実装要素 | テスト |
|---|---|---|
| オフライン完全動作 | `core/usecase` + `infra/sqlite` | 統合テスト（ネット切断模擬） |
| 共有DB同時利用 | `version`楽観ロック + retry | 競合/Busy系テスト |
| 鍵ライフサイクル運用 | AccessKeyUseCase群 + AdminConsole | ユースケース+E2E |
| 監査90日参照 | `audit_logs` + archive job | アーカイブ統合テスト |
| RO制約順守 | `SetReadOnlyModeUseCase` + UI disable | E2E操作制限テスト |

---

## 13. 実装スプリント提案（2週間×4）

1. Sprint 1: ドメイン + Task CRUD + Tree最小表示
2. Sprint 2: 認証/キー + 権限 + 監査基盤
3. Sprint 3: Board D&D + 競合解決 + ROモード
4. Sprint 4: DBプロファイル切替 + Backup/Restore + NetworkFS Guard

---

## 14. 未確定パラメータ（要実測で確定）

1. Argon2id負荷パラメータ（低スペックPCでの応答時間）
2. SMB/NFS別の安全閾値チューニング値（既定値からの環境別補正）
3. Board Webviewの仮想リスト閾値（描画性能）
4. 監査アーカイブ圧縮方式（zstd/gzip）

以上。
