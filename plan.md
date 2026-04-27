# 実装計画（TDD）

## 目的
詳細設計書（`DETAILED_DESIGN.md`）を実装可能なタスクへ分解し、Red→Green→Refactorで段階的に進める。

---

## フェーズ0: 開発基盤
- [x] ディレクトリ骨格を作成（`core / infra / ui`）
- [x] テスト実行基盤（unit/integration）を整備
- [x] DIの最小構成を用意（UI→UseCase注入）
- [x] エラーコード共通定義（`E_*`）

## フェーズ1: ドメイン実装
- [ ] ValueObject（ULID/Title/DueDate/Tag/Version）
- [ ] Entity（User/Task/Comment）
- [ ] バリデーション（title, tags, dueDate, comment body）
- [ ] Domain Service（AuthorizeTaskEditPolicy / ConflictDetector / AccessKeyPolicy）

## フェーズ2: 永続化（SQLite）
- [ ] 初期マイグレーション（DDL + Index + Trigger）
- [ ] TransactionManager実装
- [ ] Repository実装（Task/Comment/Permission/Audit）
- [ ] AccessKeyRepository実装
- [ ] DatabaseProfileRepository実装
- [ ] ProfileKeyWrapperRepository実装
- [ ] FeatureFlagRepository実装
- [ ] ConnectorSettingsRepository実装
- [ ] 楽観ロック更新（`updateWithVersion`）
- [ ] マイグレーション実行アルゴリズム（失敗時RO復帰）

## フェーズ3: コアユースケース
- [ ] CreateTaskUseCase
- [ ] UpdateTaskUseCase
- [ ] MoveTaskStatusUseCase（UpdateTask再利用）
- [ ] コメント系UseCase（追加/更新/削除/一覧）
- [ ] 監査ログ同一Tx記録

## フェーズ4: 認証・権限・プロファイル
- [ ] AuthenticateAccessKeyUseCase（Argon2id照合/DEK復号）
- [ ] キー管理UseCase（Issue/Revoke/Reissue）
- [ ] RotateConnectorSecretUseCase
- [ ] SetFeatureFlagUseCase（scope: global/profile/user）
- [ ] 権限UseCase（GrantProjectEditPermission/ExpirySweep）
- [ ] DB接続UseCase（SwitchDatabaseProfile/SetReadOnlyMode）
- [ ] SessionLifecycle / authToken 管理（TTL/アイドル失効/強制失効）
- [ ] Connector設定更新UseCase群との連動確認（feature flag評価順序を含む）

## フェーズ5: UI統合
- [x] VS Codeコマンド登録（open/select/create/toggle）
- [x] TreeViewProvider（遅延ロード）
- [x] BoardWebviewPanel（D&Dでステータス更新）
- [x] CommentThreadPanel
- [x] StatusBarController（DB/Mode/Health）
- [x] AuditArchiveSearch UI
- [x] PurgeAuditArchiveUseCase UI（dry-run→実行導線）
- [x] Feature Flag管理UI（更新/スコープ表示/反映確認）
- [x] Connector UI連動（有効/無効、設定検証結果、secret_ref不整合時表示）

## フェーズ6: 競合・安全性
- [x] DetectTaskConflictUseCase
- [x] ResolveTaskConflictUseCase（LOCAL/REMOTE/MANUAL）
- [x] NetworkFS Safety Guard（ロック診断/RTT判定）
- [x] リトライ制御（SQLITE_BUSY/IOERR）
- [x] AuditArchiveSearch UI の性能/導線調整（90日超の横断検索）
- [x] PurgeAuditArchiveUseCase UI の運用ガード確認（管理者のみ・承認必須）

## フェーズ7: バックアップ・監査運用
- [x] バックアップ（手動/日次/重要操作前）
- [x] RestoreBackupSnapshotUseCase
- [x] 監査アーカイブ（日次圧縮/移送）
- [x] PurgeAuditArchiveUseCase（dry-run必須）

---

## TDD運用ルール（各タスク共通）
1. **Red**: 失敗するテストを先に作成（正常系1 + 異常系）
2. **Green**: 最小実装でテストを通す
3. **Refactor**: 重複排除・責務整理・命名改善

## 着手順（最小縦切り）
1. フェーズ0
2. フェーズ1（Task/Tag/Version中心）
3. フェーズ2（tasks/comments/audit_logs + Tx）
4. フェーズ3（Create/Update/MoveStatus）
5. フェーズ5（Tree/Board最小表示）

上記完了時点で「作成→表示→更新→監査記録」の最小動線を確認できる。
