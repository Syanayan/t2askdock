# 基本設計書 v0.1
## VS Code拡張機能：オフライン共有タスク管理ツール

- 作成日: 2026-04-25
- 対象要求仕様: `REQUIREMENTS.md` v1.3
- 開発方式: **TDD（テスト駆動開発）**

---

## 1. 設計方針

1. **オフライン・サーバーレス最優先**
   - すべてのコア機能（タスク管理/認証/表示/検索/監査）はローカル実行で完結。
2. **拡張容易性（OCP）**
   - コアと外部連携（GitHub/GitLab/AI/チャット/汎用コネクタ）を分離し、Provider/Adapterで追加可能にする。
3. **安全性と監査可能性**
   - 鍵管理・権限制御・監査ログを「必須ドメイン機能」としてコアに含める。
4. **共有DB運用の信頼性**
   - SQLite暗号化 + トランザクション/ロック + 競合解決フローを標準実装。
5. **TDD前提のレイヤ分離**
   - ドメイン層をVS Code API/DB実装から独立させ、ユニットテスト主体で開発を進める。

---

## 2. システム全体構成

### 2.1 論理アーキテクチャ

```text
[VS Code UI Layer]
  ├─ Tree View
  ├─ Board View (D&D)
  ├─ Command Palette / Activity Bar
  └─ Settings / Key Management UI
          │
          ▼
[Application Layer (UseCase)]
  ├─ TaskUseCase
  ├─ ProjectUseCase
  ├─ AuthKeyUseCase
  ├─ ConflictUseCase
  ├─ AuditUseCase
  └─ DatabaseSwitchUseCase
          │
          ▼
[Domain Layer]
  ├─ Entity / ValueObject
  ├─ Domain Service (権限判定・競合判定)
  └─ Repository Interface
          │
          ▼
[Infrastructure Layer]
  ├─ SQLiteEncryptedRepository
  ├─ SecretStorageKeyVault
  ├─ FileLock/Transaction Manager
  ├─ Backup Manager
  └─ Connector Providers (optional)
```

### 2.2 モジュール分割（提案）

- `src/core/domain`: エンティティ、値オブジェクト、ドメインルール
- `src/core/usecase`: 各ユースケース（アプリケーションサービス）
- `src/infra/sqlite`: SQLite暗号化接続、SQL実装、排他/再試行
- `src/infra/security`: SecretStorage連携、鍵派生・保存
- `src/infra/audit`: 監査ログ記録・参照
- `src/ui/tree`, `src/ui/board`, `src/ui/commands`: VS Code表示/操作
- `src/connectors/*`: 将来拡張Provider（機能フラグ管理含む）

---

## 3. ドメイン設計

### 3.1 主要エンティティ

- `User`
  - `userId`, `displayName`, `role(admin|general)`, `status`
- `AccessKey`
  - `keyId`, `ownerType(user|device)`, `expiresAt`, `revokedAt`, `hash`, `salt`
- `Project`
  - `projectId`, `name`, `description`, `archived`
- `Task`
  - `taskId`, `projectId`, `title`, `description`, `status`, `priority`, `assignee`, `dueDate`, `tags`, `parentTaskId`, `createdBy`, `updatedBy`, `version`
- `Comment`
  - `commentId`, `taskId`, `authorId`, `body`, `createdAt`
- `AuditLog`
  - `logId`, `actorId`, `actionType`, `targetType`, `targetId`, `diff`, `createdAt`
- `DatabaseProfile`
  - `profileId`, `path`, `mode(readWrite|readOnly)`, `lastConnectedAt`

### 3.2 値オブジェクト

- `TaskStatus`（todo / in_progress / done / blocked 等）
- `Priority`（low / medium / high / critical）
- `PermissionScope`（担当範囲内編集判定条件）
- `ConflictResolutionPolicy`（LOCAL_WIN / REMOTE_WIN / MANUAL_MERGE）

### 3.3 ドメインルール（抜粋）

1. 一般ユーザーの編集は以下のみ許可:
   - `assignee == currentUser` または
   - `createdBy == currentUser` または
   - 管理者付与の `projectEditGrant` がある
2. 読み取り専用接続時は変更系ユースケースを一律拒否。
3. 暗号化未設定DBは起動時に利用不可（Fail Fast）。
4. 競合未解決状態での保存禁止。
5. 監査対象操作（キー運用、権限変更、競合解決、タスク更新）を必ず監査ログ化。

---

## 4. データ設計（SQLite）

### 4.1 テーブル一覧（初期案）

- `users`
- `access_keys`
- `projects`
- `tasks`
- `task_tags`
- `task_comments`
- `project_permissions`
- `audit_logs`
- `db_profiles`
- `feature_flags`
- `connector_settings`

### 4.2 主要テーブル定義（要点）

#### tasks
- 主キー: `task_id`
- インデックス:
  - `idx_tasks_project_status(project_id, status)`
  - `idx_tasks_assignee(assignee)`
  - `idx_tasks_due_date(due_date)`
  - `idx_tasks_updated_at(updated_at)`
- 楽観ロック: `version INTEGER NOT NULL`

#### access_keys
- 保持項目:
  - `key_hash`, `key_salt`（平文保持禁止）
  - `expires_at`, `revoked_at`, `issued_by`, `issued_for`
- 制約:
  - `revoked_at IS NULL` かつ `expires_at > now` のみ有効

#### audit_logs
- 90日以上参照可能なため、`created_at` インデックス必須
- `action_type`, `actor_id`, `target_type`, `target_id`, `payload_diff_json`

### 4.3 マイグレーション方針

- `schema_version` 管理を実装。
- 起動時に自動マイグレーション（管理者権限時のみ実行）。
- 失敗時はロールバックし、運用継続を停止。

---

## 5. 機能設計（ユースケース）

### 5.1 タスク管理

- `CreateTaskUseCase`
- `UpdateTaskUseCase`
- `DeleteTaskUseCase`
- `CloneTaskUseCase`
- `MoveTaskStatusUseCase`（Board D&D）

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
- `AuthorizeTaskEditPolicy`

### 5.4 DB切替

- `RegisterDatabaseProfileUseCase`（管理者のみ）
- `SwitchDatabaseProfileUseCase`
- `OpenDatabaseConnectionUseCase`

### 5.5 競合解決

- `DetectTaskConflictUseCase`
- `ResolveTaskConflictUseCase`
  - Local優先 / 最新優先 / 手動マージ
- 未解決時は保存不可エラーを返却

### 5.6 監査

- すべての更新系UseCase完了時に `AuditLogWriter` を呼び出し
- 監査ログ一覧/検索ユースケースを提供

---

## 6. VS Code UI設計

### 6.1 拡張ポイント

- Activity Bar View Container: `taskDock`
- View:
  - `taskDock.treeView`
  - `taskDock.boardView`
- Commands:
  - `taskDock.openBoard`
  - `taskDock.openTree`
  - `taskDock.selectDatabase`
  - `taskDock.createTask`
  - `taskDock.manageAccessKeys`

### 6.2 画面仕様（要点）

1. **Tree View**
   - `Project > Task > Subtask` 階層表示
2. **Board View**
   - ステータス列カンバン
   - D&D時は `MoveTaskStatusUseCase` 呼び出し
3. **鍵管理画面（管理者のみ）**
   - 発行、失効、再発行、期限設定
4. **競合解決ダイアログ**
   - 差分（項目/更新者/更新時刻）表示
   - 解決方式選択

### 6.3 テーマ対応

- VS Code Theme Color Tokenを優先利用
- 独自色はライト/ダーク両方のコントラスト基準を満たすこと

---

## 7. セキュリティ設計

1. アクセスキーはハッシュ化（例: Argon2id/PBKDF2）し、平文保存しない。
2. DB暗号鍵は以下で保護:
   - VS Code SecretStorage
   - 管理者キーからの派生鍵（KDF）
3. メモリ上の機微情報は利用後に参照を破棄。
4. 監査ログ改ざん対策として、将来拡張で署名/チェーン化を考慮。

---

## 8. 信頼性設計

1. **同時編集制御**
   - 優先: 楽観ロック（`version`）+ 更新時検証
   - 補助: ファイルロック/トランザクション
2. **書込リトライ**
   - 指数バックオフで最大N回再試行（設定可能）
3. **バックアップ**
   - 世代管理（例: 日次 + 直近N世代）
4. **共有フォルダ切断**
   - UIは維持、状態バナー表示、再接続コマンドを提示

---

## 9. 将来拡張設計（Connector）

### 9.1 インターフェース

```ts
interface ConnectorProvider {
  id: string;
  isEnabled(): boolean;
  validateConfig(): Promise<void>;
  pull(): Promise<SyncResult>;
  push(changes: DomainChangeSet): Promise<SyncResult>;
  mapExternalToDomain(payload: unknown): DomainChangeSet;
}
```

### 9.2 拡張原則

- コアは `ConnectorProvider` の抽象にのみ依存。
- 各連携は `src/connectors/<provider>` に閉じる。
- 機能フラグOFF時は初期化しない。

---

## 10. TDD開発計画（基本設計に紐づく）

### 10.1 テストレイヤ戦略

1. **ユニットテスト（最優先）**
   - ドメインルール、権限判定、競合判定
2. **ユースケーステスト**
   - リポジトリをモック化し、業務フロー検証
3. **インフラ統合テスト**
   - SQLite暗号化、トランザクション、マイグレーション
4. **拡張機能E2Eテスト**
   - VS Code Test Runnerでコマンド/ビュー動作確認

### 10.2 TDDサイクルの適用単位

- 1ユースケース = 1サイクル（Red→Green→Refactor）
- 受け入れ基準に直結する振る舞いを先にテスト化

### 10.3 要求トレーサビリティ（抜粋）

- FR-01 ↔ `TaskUseCase` + `TaskRepository` テスト
- FR-02 ↔ `GetTaskTree/Board` + D&Dイベントテスト
- FR-06 ↔ DBプロファイル管理テスト
- FR-07 ↔ 競合検出/解決テスト
- FR-08 ↔ 監査ログ記録テスト
- NFR-01 ↔ オフラインE2E（ネット遮断環境）
- NFR-03 ↔ 異常終了/復旧テスト

### 10.4 最初の実装バックログ（TDD順）

1. タスクエンティティ + 権限ポリシー
2. タスクCRUDユースケース
3. 監査ログ書込
4. SQLite実装 + 暗号化起動チェック
5. Tree View表示
6. Board View + D&D
7. 競合解決ダイアログ
8. キー管理UI

---

## 11. 受け入れ観点への設計適合

- オフライン完全動作: コア機能がローカルDB・ローカルUIで完結
- サーバーレス共有: 共有フォルダ上SQLite単一ファイル運用
- 権限分離: 管理者専用ユースケースを明示
- 競合必須フロー: 検出→通知→解決→監査をユースケース化
- 拡張分離: ConnectorProvider抽象でコア非改変追加可能

---

## 12. 未確定事項（次工程で確定）

1. SQLCipherライブラリ選定（Nodeバインディング/配布サイズ）
2. アクセスキーのフォーマット仕様（長さ、表示マスク方針）
3. 監査ログ保持ポリシー（90日超のアーカイブ方式）
4. Board UI実装方式（Webview vs TreeDataProvider併用）
5. 共有フォルダ種別ごとのロック実運用検証条件

