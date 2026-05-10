# カンバン表示改善 / DBアンマウント実装タスク

> 目的: カンバン表示の崩れを修正し、DB 未接続状態の切り替えを実装する。

---

## 目的

- カンバン画面の表示崩れを修正する
- カンバン内での直接タスク追加 UI を廃止する
- DB 接続を安全に閉じ、関連 UI をクリアする
- 未接続状態をユーザーに明示する

---

## 実装対象

- `src/ui/webview/board-webview-panel.ts`
- `src/ui/webview/task-table-webview-panel.ts`
- `src/extension.ts`
- `src/core/usecase/unmount-database-usecase.ts`
- `src/infra/sqlite/database-manager.ts`

---

## 要件

- カンバンタスク追加は Webview 画面経由に統一し、カンバン内直接追加を行わない
- カンバン表示のレイアウト崩れを解消する
- `DB Unmount` を実行すると現在の DB 接続を閉じる
- DB 接続解除時に現在選択中の DB 情報をクリアする
- ツリー表示・カンバン表示・詳細画面をすべてクリアする
- DB 未接続状態を画面上に表示する

---

## グループA: カンバン UI 修正

- [x] **A-1 追加 UI の撤去**
  - カンバン内の `Add Task` 入力フォームを削除する
  - 代わりに右上 `Add Task` ボタンを表示し、Webview を開く

- [x] **A-2 レイアウト崩れ修正**
  - カラム幅・カード高さ・マージンを安定化する
  - 作成時 / 更新時の再描画で崩れないことを確認する

- [x] **A-3 表示対象の明確化**
  - `Close` / `Archive` タスクは通常カンバンに表示しない
  - `Done` タスクは `Archive` 対象として扱う

---

## グループB: DB アンマウント

- [ ] **B-1 `Unmount Database` コマンド**
  - `src/extension.ts` に `taskDock.unmountDatabase` コマンドを追加
  - コマンド実行で現在の DB 接続を閉じる処理を呼ぶ

- [ ] **B-2 UI 状態クリア**
  - ツリー・カンバン・詳細パネルの現在表示を消去する
  - `selectedDatabaseProfile` を `null` に戻す
  - 画面上に「DB 未接続」状態を明示する

- [ ] **B-3 DB マネージャーの安全終了**
  - `database-manager` のアンマウント処理でトランザクションを終結し、リソースを解放する
  - マウント解除後に同じ DB を再接続できる状態に戻す

---

## 受け入れ基準

1. カンバン画面に直接追加 UI は存在しない
2. `Add Task` ボタンからタスク作成画面に遷移できる
3. `Unmount Database` 実行後にすべての画面がクリアされ、未接続表示になる
4. DB アンマウント後に元 DB を再接続できる基本構造が残る
