# DBプロファイル／マルチDBマウント管理タスク

> 目的: 新規追加した設計要件に沿って、SQLite DBプロファイルの登録・切替・アクセス制御・ディレクトリマウントを機能分割して実装する。

---

## 現状分析

| 機能 | 状態 | 詳細 |
|------|------|------|
| DBプロファイル | **設計のみ** | `db_profiles` にマウント情報を追加済み。実装は未着手。 |
| DBマウント | **設計のみ** | `MountDatabaseUseCase` / `UnmountDatabaseUseCase` を設計に追加。 |
| ディレクトリ一括登録 | **設計のみ** | `RegisterDatabaseDirectoryUseCase` / `ScanDatabaseDirectoryUseCase` を設計に追加。 |
| DBアクセス制御 | **設計のみ** | 一般ユーザーは読み書き権限のあるDBのみ利用可、OSレベル権限チェックを明記。 |
| タスク移行 | **設計のみ** | `MoveTaskBetweenProfilesUseCase` を追加し、DB間移行の要件を定義。 |

---

## グループA: DBプロファイル管理基盤

- [ ] **A-1 `db_profiles` テーブル拡張**
  - `mount_source` を追加（`individual` | `directory`）
  - `accessAllowed` 相当の判定を実装できるメタ情報を保持

- [ ] **A-2 `DatabaseProfile` ドメイン型追加**
  - `profileId`, `name`, `path`, `mode`, `isDefault`, `lastConnectedAt`
  - `mountSource`, `accessAllowed`
  - `encryptedDek`, `dekWrapSalt`

- [ ] **A-3 `DatabaseProfileRepository` の実装**
  - プロファイル登録/更新/削除/取得/一覧取得
  - `mountSource` を含めた永続化

- [ ] **A-4 `SwitchDatabaseProfileUseCase` の実装**
  - OSファイルアクセス権確認を追加
  - 認証状態と暗号化接続テストを含める
  - 成功時にアクティブプロファイルを更新

---

## グループB: DBマウントとディレクトリ管理

- [ ] **B-1 `MountDatabaseUseCase`**
  - 管理者専用
  - ファイル存在チェック、OS読み取り/書き込み権限チェック
  - SQLite暗号化/DEK復号の簡易検証
  - `db_profiles` 登録
  - SecretStorage に最終アクセスキー情報を保存

- [ ] **B-2 `UnmountDatabaseUseCase`**
  - 管理者専用
  - `db_profiles` から対象プロファイル削除
  - SecretStorage メタデータクリーンアップ

- [ ] **B-3 `RegisterDatabaseDirectoryUseCase`**
  - 管理者専用
  - 指定ディレクトリのSQLiteファイルを列挙
  - 各ファイルに `MountDatabaseUseCase` 相当の検証を実行
  - `mountSource = 'directory'` で一括登録/監視

- [ ] **B-4 `ScanDatabaseDirectoryUseCase`**
  - ディレクトリ配下の追加/削除/権限変化を検知
  - UIイベント通知 `DATABASE_DIRECTORY_UPDATED`

---

## グループC: アクセス制御とReadOnly運用

- [ ] **C-1 OSファイルアクセス権検証**
  - `general`ユーザーは読み書き可能なDBファイルのみ利用可
  - `readOnly` プロファイルの場合は読み取りのみ許可

- [ ] **C-2 `SetReadOnlyModeUseCase`**
  - `general` は `true` のみ切替可
  - `false` への復帰は管理者または自動復帰のみ

- [ ] **C-3 権限チェック付き `AuthorizeTaskEditPolicy`**
  - DBプロファイル経由の接続モードを考慮
  - 読み取り専用接続時は変更系を拒否

---

## グループD: DB間タスク移行

- [ ] **D-1 `MoveTaskBetweenProfilesUseCase`**
  - `sourceProfileId`, `targetProfileId`, `taskId`, `expectedVersion`, `copyMode`
  - 両プロファイルがアクセス可能であることを確認
  - `READ_WRITE` モードを確認
  - 管理者または両方の編集権限を持つユーザーのみ許可

- [ ] **D-2 移行処理実装**
  - sourceDBからタスクと関連コメント・タグを読み込み
  - targetDBへ保存
  - `copyMode=false` の場合は sourceDBから論理削除または移動フラグ設定
  - `TASK_MOVED_ACROSS_DB` 監査ログ記録

- [ ] **D-3 UIフロー検討**
  - プロファイル切替UIから「このタスクを別DBへ移動」操作を提供
  - 実行前に移行先DB/モード/コピー設定を確認

---

## 優先度

1. A-1〜A-4: DBプロファイル基盤
2. B-1〜B-4: マウント/ディレクトリ管理
3. C-1〜C-3: アクセス制御
4. D-1〜D-3: DB間タスク移行
