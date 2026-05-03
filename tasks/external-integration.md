# 外部連携・AI統合タスク

> 目的: AIによるタスク作成、GitHub/GitLab Issues との双方向同期を実現する。
> 設計書にはConnectorパターンが定義済みだが、コードは「設定の保存」のみ実装されており
> 実際の同期・AI呼び出しは一切未実装。

---

## 現状分析

| 機能 | 状態 | 詳細 |
|------|------|------|
| AI連携 | **未実装** | LLM SDKなし、自然言語タスク作成なし |
| GitHub連携 | **スキーマのみ** | `connector_settings`テーブルと設定保存usecase2本のみ |
| GitLab連携 | **スキーマのみ** | 同上 |
| 同期エンジン | **未実装** | ポーリング・スケジュール実行なし |
| UIイベントバス | **ローカルのみ** | 外部イベント受信不可 |

**アーキテクチャ上の前提**
- VS Code拡張機能のためHTTPサーバー・Webhookリスナーは持てない
- 外部APIはポーリング（`setInterval` / VS Codeバックグラウンドタスク）で取得する
- `connector_settings.sync_policy` に `manual|scheduled` が定義済み（設計意図あり）
- `ConnectorSettingsRepository.upsert()` と `UpdateConnectorSettingsUseCase` が利用可能

---

## グループA: AIによるタスク作成

- [ ] **A-1 AI SDKの追加と設定**
  - `@anthropic-ai/sdk` を `dependencies` に追加（または `openai` を選択可能にする）
  - 設定項目: APIキー、使用モデル名
  - APIキーは `connector_settings.settings_json` に格納（`connector_id = 'ai'`）
  - `src/infra/services/ai-task-creator.ts` を新規作成し、SDK呼び出しをラップする

- [x] **A-2 自然言語タスク作成コマンド**
  - コマンド `taskDock.createTaskFromAI` を追加
  - `vscode.window.showInputBox` で自然言語入力を受け取る（例: 「来週までにAPIドキュメントを書く、優先度高」）
  - AIに構造化JSONを返させる（`title`, `description`, `priority`, `dueDate`, `tags`）
  - 抽出結果を確認ダイアログで表示してから `CreateTaskUseCase` を呼び出す
  - `package.json` に `taskDock.createTaskFromAI` コマンドを追加

- [ ] **A-3 AIによるタスク補完・提案**
  - タスク作成時に `description` が空の場合、AIに説明文の草案を生成させる
  - タスク一覧からのバッチ分析: 「未着手タスクの優先度を自動提案」コマンド
  - `taskDock.suggestPriorities` コマンドで全タスクをAIに渡し、優先度変更を提案

- [ ] **A-4 AIコネクター設定UI**
  - `ConnectorManagementPanel` にAI設定タブを追加
  - APIキーの入力・保存・削除（`UpdateConnectorSettingsUseCase` を使用）
  - 接続テストボタン（テスト文字列を送信してレスポンスを確認）

---

## グループB: IConnectorProvider インターフェースの整備

> GitHub・GitLab・その他サービスを統一的に扱うための抽象化層。
> 新しいサービスを追加する際にこのインターフェースを実装するだけで済む。

- [x] **B-1 IConnectorProvider インターフェースの定義**
  - `src/core/ports/connector-provider.ts` を新規作成
  ```ts
  interface IConnectorProvider {
    readonly connectorId: string;        // 'github' | 'gitlab' | ...
    fetchIssues(settings: ConnectorConfig): Promise<ExternalIssue[]>;
    pushStatus?(taskId: string, status: TaskStatus, settings: ConnectorConfig): Promise<void>;
  }
  type ExternalIssue = {
    externalId: string;    // GitHubなら issue number
    title: string;
    description: string | null;
    status: 'open' | 'closed';
    assignee: string | null;
    labels: string[];
    url: string;
  };
  ```

- [x] **B-2 ConnectorRegistry の実装**
  - `src/core/connector/connector-registry.ts` を新規作成
  - `register(provider: IConnectorProvider)` / `get(connectorId: string)` メソッド
  - `AppContainer` でレジストリを生成し、各プロバイダーを登録する

- [x] **B-3 external_task_map テーブルの追加（マイグレーションv2）**
  - 外部IssueとローカルタスクのIDマッピングを保持する
  ```sql
  CREATE TABLE IF NOT EXISTS external_task_map (
    connector_id TEXT NOT NULL,
    external_id  TEXT NOT NULL,
    task_id      TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    synced_at    TEXT NOT NULL,
    PRIMARY KEY(connector_id, external_id)
  );
  ```
  - `ExternalTaskMapRepository` を `src/infra/sqlite/repositories/` に追加

---

## グループC: GitHub Issues 連携

- [ ] **C-1 VS Code GitHub認証の利用**
  - `vscode.authentication.getSession('github', ['repo'])` でOAuthトークンを取得
  - `connector_settings.auth_type = 'vscode_auth'` として保存（キーを拡張機能に委譲）
  - トークン取得失敗時のエラーハンドリング

- [ ] **C-2 GitHubConnectorProvider の実装**
  - `src/infra/connectors/github-connector-provider.ts` を新規作成
  - `IConnectorProvider` を実装
  - `fetchIssues`: `GET /repos/{owner}/{repo}/issues` をポーリング
  - `pushStatus`: Issue をクローズ/再オープン（`PATCH /repos/{owner}/{repo}/issues/{number}`）
  - 設定 `settings_json`: `{ owner: string, repo: string, labelFilter?: string }` 

- [ ] **C-3 GitHub設定UI**
  - `ConnectorManagementPanel` にGitHubタブを追加
  - 入力: リポジトリ（`owner/repo`形式）、ラベルフィルター
  - 「接続テスト」ボタン: Issues API を叩いて件数を表示
  - 同期ポリシー選択: 手動 / スケジュール（15分・1時間・毎日）

- [ ] **C-4 Issue → タスク自動作成**
  - 新しいIssueをフェッチしたとき、`external_task_map` に存在しなければ `CreateTaskUseCase` を呼び出す
  - マッピングを `external_task_map` に保存
  - `tags` に `['github', 'issue']` を自動付与

- [ ] **C-5 タスク変更 → GitHub Issue更新（双方向同期）**
  - タスクの `status` が `done` に変更されたとき、対応するGitHub IssueをCloseする
  - `UiEventBus` の `TASK_UPDATED` イベントを受けて `pushStatus` を呼び出す

---

## グループD: GitLab Issues 連携

- [ ] **D-1 GitLabConnectorProvider の実装**
  - `src/infra/connectors/gitlab-connector-provider.ts` を新規作成
  - `IConnectorProvider` を実装
  - `fetchIssues`: `GET /projects/{id}/issues` をポーリング
  - `pushStatus`: `PUT /projects/{id}/issues/{iid}` で `state_event: 'close'|'reopen'`
  - 設定 `settings_json`: `{ projectId: string, baseUrl: string }` （self-hosted対応）

- [ ] **D-2 GitLab Personal Access Token設定UI**
  - `ConnectorManagementPanel` にGitLabタブを追加
  - 入力: GitLab URL（デフォルト `https://gitlab.com`）、プロジェクトID、PAT
  - PATは `VS Code SecretStorage` (`context.secrets`) に保存（平文保存しない）
  - 「接続テスト」ボタン

- [ ] **D-3 Issue → タスク自動作成 / 双方向同期**
  - C-4・C-5 と同じロジックをGitLabプロバイダーで実装
  - `tags` に `['gitlab', 'issue']` を自動付与

---

## グループE: バックグラウンド同期エンジン

- [ ] **E-1 ConnectorSyncOrchestrator の実装**
  - `src/core/connector/connector-sync-orchestrator.ts` を新規作成
  - `sync(connectorId: string)` メソッド: プロバイダー呼び出し → 差分検出 → Create/Update
  - 差分検出: `external_task_map` に存在しないIssueのみ新規作成、存在するものはスキップ

- [ ] **E-2 スケジュール実行（setInterval）**
  - `extension.ts` の `activate()` で同期間隔を設定
  - `connector_settings.sync_policy === 'scheduled'` のコネクターのみ自動実行
  - VS Code `setInterval` で指定間隔（15分・1時間・毎日）ごとに `sync()` を呼び出す
  - `context.subscriptions.push({ dispose: () => clearInterval(handle) })` でクリーンアップ

- [ ] **E-3 手動同期コマンド**
  - コマンド `taskDock.syncConnector` を追加
  - サービス一覧から選択 → `ConnectorSyncOrchestrator.sync()` を呼び出す
  - 同期結果（新規作成件数・スキップ件数）をステータスバーに表示

- [ ] **E-4 同期ステータスのUI表示**
  - ステータスバーに最終同期日時を表示（例: `$(sync) 5分前`）
  - 同期中はスピナーアイコン表示
  - エラー時は赤アイコン + エラーメッセージ通知

---

## 着手順（最小動線優先）

```
B-1（インターフェース）→ B-2（レジストリ）→ B-3（マッピングDB）
→ A-1（AI SDK）→ A-2（自然言語コマンド）
→ C-1（GitHub認証）→ C-2（GitHubProvider）→ C-4（自動作成）
→ E-1（同期エンジン）→ E-2（スケジュール）
```

AIタスク作成（A-1〜A-2）は依存が少なく単体で動作するため、B群と並行して実装可能。

---

## 技術上の注意点

- **VS Code拡張機能はHTTPサーバーを持てない** → Webhookは受信不可。ポーリングのみ対応。
- **APIキー・PATは `context.secrets`（VS Code SecretStorage）に保存** → `connector_settings.secret_ref` はSecretStorageのキー名として使う（平文をSQLiteに入れない）
- **GitHub認証は `vscode.authentication.getSession`** → ユーザーがGitHub拡張機能をインストールしていれば追加UIなしで認証可能
- **レート制限対策** → GitHub REST API は非認証60req/h、認証5000req/h。ポーリング間隔を最短15分に制限する
- **`@anthropic-ai/sdk` はNode.js環境で動作** → VS Code拡張機能のNode.jsホストで問題なく使用可能
- **既存の `connector_settings` + `UpdateConnectorSettingsUseCase`** は設定保存に再利用できる。同期ロジックのみ新規実装が必要
