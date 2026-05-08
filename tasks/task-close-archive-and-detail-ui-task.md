# タスク Close / Archive / 詳細画面 UI 実装タスク

> 目的: タスク詳細画面の Close/Archive 操作を実装し、削除ではなく状態管理で保持する運用を確立する。

---

## 目的

- `Close` と `Archive` を削除と区別して正しく扱う
- 重要な履歴を DB に残したまま UI 表示を制御する
- タスク詳細画面から操作できるようにする

---

## 実装対象

- `src/core/domain/entities/task.ts` またはタスクエンティティ定義
- `src/core/ports/repositories/task-repository.ts`
- `src/ui/webview/task-detail-webview-panel.ts`
- `src/ui/webview/task-table-webview-panel.ts`
- `src/extension.ts`

---

## 要件

- `Close` はタスクを削除せず、`Close` 状態にする
- `Close` 実行時に理由入力を必須化する
- `Close` タスクはカンバン・通常一覧に表示しないが DB には残す
- `Archive` は `Done` / `Close` のタスクが対象
- `Archive` タスクは通常一覧に表示しないが履歴画面または切替で確認できる
- `Archive` は複数タスクを一括で実行できる
- `Close` / `Archive` の確認ダイアログを表示する
- タスク詳細画面に `Edit` / `Close` ボタンを右上に固定表示する

---

## グループA: ドメイン / 永続化

- [ ] **A-1 `Task` 状態拡張**
  - `status` とは別に `isClosed: boolean` / `isArchived: boolean` または `taskState: 'active' | 'closed' | 'archived'` を追加
  - `closeReason: string | null` を追加
  - `closedAt`, `archivedAt` を追加する場合はコメントで理由を添える

- [ ] **A-2 リポジトリ契約の更新**
  - 取得系クエリに `isClosed` / `isArchived` フィルタを追加できるようにする
  - `updateTask` 系に `closeReason` / `isClosed` / `isArchived` を受け取るオプションを追加
  - `listTasks` / `findTaskById` の返却型に新しいフラグを含める

- [ ] **A-3 `Close`/`Archive` 用ユースケース準備**
  - 既存の `UpdateTaskUseCase` を活用しつつ `CloseTaskUseCase` / `ArchiveTaskUseCase` を追加するか、拡張性を持たせる
  - `CloseTaskUseCase.execute({ taskId, reason })` と `ArchiveTaskUseCase.execute({ taskIds })` を定義

---

## グループB: タスク詳細画面 UI

- [ ] **B-1 ボタン配置**
  - 右上に `Edit` / `Close` を固定表示
  - `Close` 押下時は理由入力ダイアログを開き、空文字は禁止
  - `Edit` 押下で編集モードに切り替え、ボタン構成を `Save` / `Cancel` に変更

- [ ] **B-2 閲覧モードと編集モードの分離**
  - `body.editing` などのクラスを用いて表示要素を切り替える
  - タイトルの長さに応じてボタン位置が崩れないようにレイアウトを固定

- [ ] **B-3 HTML メッセージ連携**
  - Webview から `closeTask`, `saveTask`, `cancelEdit` のメッセージを `vscode.postMessage` で送る
  - `task-detail-webview-panel.ts` で `onDidReceiveMessage` を受け取り、対応コマンドを実行

---

## グループC: Archive 操作

- [ ] **C-1 個別 Archive**
  - `Done` / `Close` タスク詳細画面に `Archive` 操作を追加するか、一覧画面から実行できるようにする
  - 実行前に確認ダイアログを表示

- [ ] **C-2 一括 Archive**
  - 複数選択されたタスクを `Archive` できる UI を準備
  - 選択対象は色付けなどで判別できるようにする

- [ ] **C-3 表示制御**
  - 通常画面の `listTasks` / `boardTasks` は `isArchived = false` のものだけを表示
  - `isClosed = true` のものも同様に通常表示から除外
  - 履歴画面や切替画面で `isArchived = true` / `isClosed = true` を表示できる設計にする

---

## 受け入れ基準

1. `Close` したタスクは通常のカンバン/一覧に表示されない
2. `Close` 実行時に理由が未入力なら処理を拒否する
3. `Done` / `Close` タスクを Archive でき、通常画面から非表示になる
4. タスク詳細画面の操作ボタンが右上に固定される
5. DB には `isClosed` / `isArchived` / `closeReason` が保存される
