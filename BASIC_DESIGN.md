# 基本設計書 v0.3
## VS Code拡張機能：オフライン共有タスク管理ツール

- 作成日: 2026-04-25
- 更新日: 2026-04-25
- 対象要求仕様: `REQUIREMENTS.md` v1.3
- 開発方式: **TDD（テスト駆動開発）**

---

## 1. 設計方針

1. **オフライン・サーバーレス最優先**
   - コア機能（タスク管理/認証/表示/検索/監査）はローカル実行で完結する。
2. **拡張容易性（OCP）**
   - コアと外部連携（GitHub/GitLab/AI/チャット/汎用コネクタ）を分離し、Provider/Adapterで追加可能にする。
3. **安全性と監査可能性**
   - 鍵管理、権限制御、監査ログをコア機能として実装する。
4. **共有DB運用の信頼性**
   - SQLite暗号化 + トランザクション制御 + 競合解決フローを標準実装する。
5. **TDD前提のレイヤ分離**
   - ドメイン層をVS Code API/DB実装から独立し、ユニットテスト主導で開発可能にする。

---

## 2. システム全体構成

### 2.1 論理アーキテクチャ

```text
[VS Code UI Layer]
  ├─ Tree View
  ├─ Board View (D&D)
  ├─ Command Palette / Activity Bar
  ├─ Database/Profile Switch UI
  ├─ ReadOnly Indicator
  └─ Admin Console (Key/Permission/Backup)
          │
          ▼
[Application Layer (UseCase)]
  ├─ TaskUseCase
  ├─ ProjectUseCase
  ├─ AccessKeyUseCase
  ├─ PermissionGrantUseCase
  ├─ ReadOnlyModeUseCase
  ├─ ConflictUseCase
  ├─ AuditUseCase
  ├─ DatabaseProfileUseCase
  └─ BackupRestoreUseCase
          │
          ▼
[Domain Layer]
  ├─ Entity / ValueObject
  ├─ Domain Service (権限判定・競合判定・鍵ポリシー)
  └─ Repository Interface
          │
          ▼
[Infrastructure Layer]
  ├─ SQLiteEncryptedRepository
  ├─ SecretStorageKeyVault
  ├─ KeyDerivationService
  ├─ Transaction/Retry Manager
  ├─ NetworkFS Safety Guard
  ├─ AuditRetention Manager
  └─ Connector Providers (optional)
```

### 2.2 モジュール分割（提案）

- `src/core/domain`: エンティティ、値オブジェクト、ドメインルール
- `src/core/usecase`: ユースケース本体（権限、キー、監査、競合、DB切替）
- `src/infra/sqlite`: SQLite暗号化接続、SQL、トランザクション、ロック、リトライ
- `src/infra/security`: SecretStorage、鍵派生、鍵ローテーション
- `src/infra/networkfs`: SMB/NFS安全ガード、共有フォルダ健全性チェック
- `src/infra/audit`: 監査ログ記録、保持、アーカイブ、検索最適化
- `src/ui/tree`, `src/ui/board`, `src/ui/admin`, `src/ui/statusbar`, `src/ui/commands`
- `src/connectors/*`: 将来拡張Provider（機能フラグ管理含む）

---

## 3. ドメイン設計

### 3.1 主要エンティティ

- `User`
  - `userId`, `displayName`, `role(admin|general)`, `status`
- `AccessKey`
  - `keyId`, `ownerType(user|device)`, `expiresAt`, `revokedAt`, `hash`, `salt`, `issuedBy`, `issuedAt`
- `Project`
  - `projectId`, `name`, `description`, `archived`, `createdAt`, `updatedAt`
- `Task`
  - `taskId`, `projectId`, `title`, `description`, `status`, `priority`, `assignee`, `dueDate`, `tags`, `parentTaskId`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `version`
- `Comment`
  - `commentId`, `taskId`, `body`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `version`, `deletedAt`
- `ProjectPermissionGrant`
  - `grantId`, `projectId`, `userId`, `canEdit`, `grantedBy`, `grantedAt`, `revokedAt`
- `AuditLog`
  - `logId`, `actorId`, `actionType`, `targetType`, `targetId`, `diff`, `createdAt`, `retentionClass`
- `DatabaseProfile`
  - `profileId`, `name`, `path`, `mode(readWrite|readOnly)`, `isDefault`, `lastConnectedAt`
- `BackupSnapshot`
  - `snapshotId`, `profileId`, `createdAt`, `generation`, `checksum`

> 注記: 要求仕様（利用者要件）に「一般ユーザーのコメント追加」が含まれるため、`Comment` は **Phase 1の実装対象** とする。

### 3.2 値オブジェクト

- `TaskStatus`（todo / in_progress / done / blocked）
- `Priority`（low / medium / high / critical）
- `PermissionScope`（担当範囲内編集判定条件）
- `ConflictResolutionPolicy`（LOCAL_WIN / REMOTE_WIN / MANUAL_MERGE）
- `ConnectionMode`（READ_WRITE / READ_ONLY）

### 3.3 ドメインルール（抜粋）

1. 一般ユーザー編集許可条件:
   - `assignee == currentUser` または
   - `createdBy == currentUser` または
   - `ProjectPermissionGrant.canEdit == true`（未失効）
2. 読み取り専用接続時は変更系ユースケースを一律拒否する。
3. 暗号化未設定DBは起動時に利用不可（Fail Fast）。
4. 競合未解決状態での保存は禁止する。
5. 監査対象操作（キー運用、権限変更、競合解決、タスク更新、バックアップ復元）を必ず監査ログ化する。

---

## 4. データ設計（SQLite）

### 4.1 テーブル一覧（初期案）

- `users`
- `access_keys`
- `projects`
- `tasks`
- `task_tags`
- `comments`
- `project_permissions`
- `audit_logs`
- `audit_log_archive`
- `db_profiles`
- `backup_snapshots`
- `feature_flags`
- `connector_settings`

### 4.2 主要テーブル定義（要点）

#### tasks
- 主キー: `task_id`
- 必須列: `created_at`, `updated_at`, `version`
- インデックス:
  - `idx_tasks_project_status(project_id, status)`
  - `idx_tasks_assignee(assignee)`
  - `idx_tasks_due_date(due_date)`
  - `idx_tasks_updated_at(updated_at)`
  - `idx_tasks_project_updated(project_id, updated_at)`
- 楽観ロック: `version INTEGER NOT NULL`

#### project_permissions
- 主キー: `grant_id`
- 列:
  - `project_id`, `user_id`, `can_edit`, `granted_by`, `granted_at`, `revoked_at`
- 制約:
  - `UNIQUE(project_id, user_id, revoked_at)`（同時有効grant重複防止）
- インデックス:
  - `idx_perm_project_user(project_id, user_id)`
  - `idx_perm_active(user_id, revoked_at)`

#### access_keys
- 保持項目:
  - `key_hash`, `key_salt`（平文保持禁止）
  - `expires_at`, `revoked_at`, `issued_by`, `issued_for`, `issued_at`
- 制約:
  - `revoked_at IS NULL` かつ `expires_at > now` のみ有効

#### audit_logs
- 保持項目:
  - `action_type`, `actor_id`, `target_type`, `target_id`, `payload_diff_json`, `created_at`, `retention_class`
- インデックス:
  - `idx_audit_created_at(created_at)`
  - `idx_audit_actor_created(actor_id, created_at)`
  - `idx_audit_target_created(target_type, target_id, created_at)`

### 4.3 監査ログ保持/運用ポリシー

- 参照要件: 最低90日を`audit_logs`でオンライン参照可能。
- 90日超データ: `audit_log_archive`へ日次バッチ移送（圧縮JSON+月単位パーティション）。
- 管理者UIで期間検索（既定: 30/90/180日）と対象絞り込みを提供。
- 削除ポリシー: 監査ログの物理削除は管理者でも不可、アーカイブのみ。

### 4.4 マイグレーション方針

- `schema_version` 管理を実装。
- 実行タイミング:
  1. DB接続時にバージョン判定
  2. `readWrite` かつ 管理者認証済みの場合のみ自動実行
  3. 非管理者/読み取り専用では実行せず、互換性エラーを返す
- 失敗時復旧:
  - 自動バックアップから即時ロールバック
  - DBをreadOnlyで再オープンし、運用継続可否を通知
  - 監査ログへ失敗イベントを記録

---

## 5. 機能設計（ユースケース）

### 5.1 タスク管理

- `CreateTaskUseCase`
- `UpdateTaskUseCase`
- `DeleteTaskUseCase`
- `CloneTaskUseCase`
- `MoveTaskStatusUseCase`（Board D&D）
- `AddTaskCommentUseCase`
- `UpdateTaskCommentUseCase`
- `DeleteTaskCommentUseCase`（論理削除）
- `ListTaskCommentsUseCase`

### 5.2 表示/検索

- `GetTaskTreeUseCase`
- `GetTaskBoardUseCase`
- `SearchTasksUseCase`
  - 検索（title/description/tags）
  - フィルタ（status/assignee/dueDate/priority）
  - ソート（updatedAt/dueDate/priority）

### 5.3 認証/権限

- `AuthenticateAccessKeyUseCase`
- `IssueAccessKeyUseCase`（管理者のみ）
- `RevokeAccessKeyUseCase`（管理者のみ）
- `ReissueAccessKeyUseCase`（管理者のみ）
- `GrantProjectEditPermissionUseCase`（管理者のみ）
- `RevokeProjectEditPermissionUseCase`（管理者のみ）
- `AuthorizeTaskEditPolicy`

### 5.4 DB切替/モード

- `RegisterDatabaseProfileUseCase`（管理者のみ）
- `UpdateDatabaseProfileUseCase`（管理者のみ）
- `RemoveDatabaseProfileUseCase`（管理者のみ）
- `ListDatabaseProfilesUseCase`
- `SwitchDatabaseProfileUseCase`
- `OpenDatabaseConnectionUseCase`
- `SetReadOnlyModeUseCase`
- `GetConnectionModeUseCase`

### 5.5 競合解決

- `DetectTaskConflictUseCase`
- `ResolveTaskConflictUseCase`
  - Local優先 / 最新優先 / 手動マージ
- 未解決時は保存不可エラーを返却

### 5.6 監査/バックアップ

- `WriteAuditLogUseCase`
- `SearchAuditLogsUseCase`
- `RunAuditArchiveUseCase`（日次）
- `CreateBackupSnapshotUseCase`（管理者のみ）
- `RestoreBackupSnapshotUseCase`（管理者のみ）

---

## 6. VS Code UI設計

### 6.1 拡張ポイント

- Activity Bar View Container: `taskDock`
- View:
  - `taskDock.treeView`
  - `taskDock.boardView`
  - `taskDock.auditView`
  - `taskDock.dbProfilesView`
- Status Bar:
  - `DB: <profileName>`
  - `Mode: ReadWrite | ReadOnly`
  - `Sync: Offline | Ready`
- Commands:
  - `taskDock.openBoard`
  - `taskDock.openTree`
  - `taskDock.selectDatabase`
  - `taskDock.toggleReadOnly`
  - `taskDock.createTask`
  - `taskDock.manageAccessKeys`
  - `taskDock.grantProjectPermission`
  - `taskDock.restoreBackup`

### 6.2 画面仕様（要点）

1. **Tree View**
   - `Project > Task > Subtask` 階層表示
2. **Board View**
   - ステータス列カンバン
   - D&D時は `MoveTaskStatusUseCase` 呼び出し
   - 右ペインに選択タスクのコメントスレッドを表示
3. **鍵管理画面（管理者のみ）**
   - 発行、失効、再発行、期限設定
4. **権限管理画面（管理者のみ）**
   - `project_permissions` の付与/撤回
5. **DBプロファイル画面**
   - 登録、切替、削除（一般ユーザーは参照のみ）
6. **読み取り専用表示**
   - 明示バナー + 変更系UIの無効化（ボタン/コマンド）
7. **競合解決ダイアログ**
   - 差分（項目/更新者/更新時刻）表示
   - 解決方式選択

### 6.3 DB切替の操作フロー

1. `Select Database` 実行
2. プロファイル一覧表示（アクセス可能なもののみ）
3. 選択時に接続テスト（暗号化/ロック可否）
4. 成功: ビュー更新 + status bar更新
5. 失敗: readOnlyで再試行提案または別プロファイル選択

### 6.4 テーマ対応

- VS Code Theme Color Tokenを優先利用。
- 独自色はライト/ダーク両方のコントラスト基準を満たす。

---

## 7. セキュリティ設計

### 7.1 アクセスキーとDB暗号鍵の連携フロー

1. 管理者がアクセスキーを発行（ランダム値）
2. キーは `hash + salt` で `access_keys` に保存（平文不保持）
3. DB暗号鍵 `DEK` は直接保存せず、`KEK` でラップして保存
4. `KEK` は `アクセスキー + 端末情報 + salt` からKDFで導出
5. `KEK` 導出に必要な材料のうち秘匿値は SecretStorage に保存
6. 認証成功時のみ `DEK` を復号して接続開始
7. キー失効時は次回接続で `KEK` 導出不可となりDB復号不可

### 7.2 その他セキュリティ

- アクセスキーはハッシュ化（Argon2id/PBKDF2）
- メモリ上の機微情報は短寿命参照で保持
- 監査ログ改ざん対策として将来拡張で署名/チェーン化を考慮

---

## 8. 信頼性設計

### 8.1 共有フォルダ（SMB/NFS）上SQLiteリスクと対策

リスク:
- ファイルロック実装差異により排他が不安定化する可能性
- 断続切断時に長時間トランザクションが失敗する可能性

対策:
1. `NetworkFS Safety Guard` で接続先種別を判定し、危険構成は警告表示
2. 起動時・定期的にロック自己診断（短い書込/ロールバック検証）
3. 書込失敗時は指数バックオフで再試行（上限あり）
4. 連続失敗閾値超過で自動的にreadOnlyへ降格
5. ユーザーへ再接続案内と競合復旧ガイドを提示
6. 重要操作前に自動スナップショットを取得

### 8.2 同時編集制御

- 優先: 楽観ロック（`version`）
- 補助: トランザクション + 必要時ファイルロック

### 8.3 バックアップ/復元

- 世代管理（例: 日次 + 直近N世代）
- 復元操作は管理者のみ、監査ログ必須

---

## 9. 将来拡張設計（Connector）

### 9.1 インターフェース

```ts
interface ConnectorProvider {
  id: string;
  isEnabled(): boolean;
  canSyncOnline(): Promise<boolean>;
  validateConfig(): Promise<void>;
  pull(): Promise<SyncResult>;
  push(changes: DomainChangeSet): Promise<SyncResult>;
  resolveConflict(policy: ConflictResolutionPolicy): Promise<SyncResult>;
  mapExternalToDomain(payload: unknown): DomainChangeSet;
}
```

### 9.2 同期ポリシー

- 既定は**手動同期**（自動同期なし）
- オフライン検知時:
  - `pull/push` を無効化
  - ローカル作業は継続
  - 同期再開可能時に手動再試行を促す
- 競合時:
  - Local優先 / External優先 / Manual Merge を選択
  - 同期ログと監査ログの両方に記録

### 9.3 拡張原則

- コアは `ConnectorProvider` 抽象にのみ依存
- 各連携は `src/connectors/<provider>` に閉じる
- 機能フラグOFF時は初期化しない

---

## 10. TDD開発計画（基本設計に紐づく）

### 10.1 テストレイヤ戦略

1. **ユニットテスト**
   - ドメインルール、権限判定、競合判定、鍵ライフサイクル
2. **ユースケーステスト**
   - CRUD、権限付与/撤回、読み取り専用モード遷移、DB切替
3. **インフラ統合テスト**
   - SQLite暗号化、マイグレーション、バックアップ/復元、監査アーカイブ
4. **障害系テスト**
   - ネットワーク断、書込再試行、readOnly自動降格、再接続
5. **VS Code E2E**
   - コマンド、ビュー、StatusBar、管理者UI、競合ダイアログ

### 10.2 TDDサイクルの適用単位

- 1ユースケース = 1サイクル（Red→Green→Refactor）
- 受け入れ基準に直結する振る舞いを先にテスト化

### 10.3 要求トレーサビリティ（抜粋）

- FR-01 ↔ `Task` エンティティ + CRUDユースケース
- FR-02 ↔ Tree/Board表示 + D&D更新
- FR-06 ↔ DBプロファイル管理 + 切替フロー
- FR-07 ↔ 競合検出/解決 + ロック自己診断
- FR-08 ↔ 監査書込/検索/90日参照
- DB要件(readOnly) ↔ `SetReadOnlyModeUseCase` + UI無効化
- キーライフサイクル ↔ 発行/失効/再発行 + 期限切れ再認証
- NFR-03 ↔ 異常終了復旧 + バックアップ復元

### 10.4 最初の実装バックログ（TDD順）

1. `Task` + `ProjectPermissionGrant` ドメイン
2. タスクCRUD + 認可ポリシー
3. アクセスキー認証/発行/失効/再発行
4. 暗号鍵導出フロー（アクセスキー→DEK復号）
5. SQLite実装（version競合、監査書込）
6. readOnlyモード + UI無効化
7. DBプロファイル切替UI
8. バックアップ/復元
9. NetworkFS安全ガード
10. Connector手動同期

---

## 11. 受け入れ観点への設計適合

- オフライン完全動作: ローカルDB・ローカルUIで完結
- サーバーレス共有: 共有フォルダ上SQLite運用 + 安全ガード
- 権限分離: 管理者専用ユースケースと一般ユーザー制約を明示
- 競合必須フロー: 検出→通知→解決→監査をユースケース化
- readOnly要件: 接続モード/操作制限/UI表示を設計反映
- 監査90日要件: 保持ポリシー + アーカイブ方針を明記
- 拡張分離: ConnectorProvider抽象でコア非改変追加可能

---

## 12. 未確定事項（次工程で確定）

1. SQLCipherライブラリ最終選定（バイナリ配布方式含む）
2. KDFパラメータ（メモリコスト/反復回数）
3. SMB/NFSごとのサポートマトリクス（推奨/非推奨構成）
4. 監査アーカイブの実装方式（同一DB/別ファイル）
5. Board UI実装方式（Webview vs TreeDataProvider併用）
