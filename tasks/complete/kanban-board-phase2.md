# カンバンボード Phase 2 タスク

> 目的: バグ修正・検索フィルター・タスク追加フォームの拡張・カンバン/リスト切り替えビューを実装する。

---

## 現状との差分サマリー

| 項目 | 現状 | 目標 |
|------|------|------|
| カードメニュー | 動かない（executeCommand 未接続） | 編集・削除が機能する |
| インライン作成 | projectId なしで呼び出し → 入力ダイアログが出る | ボード開放時の projectId を自動使用 |
| カラムメニュー「すべて完了」 | 動かない・不要 | 削除 |
| 検索 | なし | キーワード検索欄（タイトル・タグ・担当者） |
| タスク追加フォーム | タイトルのみ | 優先度・担当者・期限日・タグも設定可能 |
| ビュー | カンバンのみ | カンバン / リスト（階層テーブル）切り替え |
| カードクリック | 無反応 | 詳細パネルを開く |
| ドラッグ中のフィードバック | なし | ドロップ先カラムをハイライト |

---

## グループL: バグ修正

- [x] **L-1 executeCommand を BoardWebviewPanel に渡す**
  - `extension.ts` で `new BoardWebviewPanel(moveTaskStatusUseCase, eventBus)` となっている箇所に
    第3引数として `executeCommand` を追加する
  - ```ts
    new BoardWebviewPanel(
      useCases.moveTaskStatusUseCase,
      eventBus,
      async (command, args) => vscode.commands.executeCommand(command, args)
    )
    ```
  - これによりカードの「...」メニューで編集・削除が機能するようになる

- [x] **L-2 カンバンボードの projectId を保持して card:create に渡す**
  - `BoardWebviewPanel.render()` が受け取った `tasks` から `projectId` を取得し、
    HTMLの `<script>` 内でJS変数 `let projectId = '...'` として埋め込む
  - `card:create` メッセージ送信時に `{ type: 'card:create', status, title, projectId }` を含める
  - `isCardCreateMessage` の型ガードと `executeCommand` の引数に `projectId` を追加する
  - `extension.ts` の `createTask` コマンドハンドラーは `input?.projectId` があれば `showInputBox` をスキップする（既存実装で対応済み）

- [x] **L-3 カラムメニューの「すべて完了」ボタンを削除**
  - `board-webview-panel.ts` のHTML内から `.column-menu` ボタン・`.column-menu-list` div ・関連JS (`querySelectorAll('.column-menu')` / `querySelectorAll('.column-complete')`) をすべて削除する
  - `.column-actions` CSS クラスも削除する
  - カラムヘッダーを `<h3>Title <span class="count-badge">0</span></h3>` のみにシンプル化する

---

## グループM: 検索フィルター

- [x] **M-1 検索入力欄の追加**
  - ツールバーの左端に `<input type="search" id="search-box" placeholder="検索..." />` を追加する
  - CSS: `width: 160px; border: 1px solid #ccc; border-radius: 4px; padding: 4px 8px; font-size: 12px;`

- [x] **M-2 リアルタイム絞り込みの実装**
  - `document.getElementById('search-box')` の `input` イベントで `searchQuery` 変数を更新し `render()` を呼ぶ
  - `render()` 内でのフィルタ条件に以下を追加する:
    ```js
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      task.title.toLowerCase().includes(q) ||
      (task.assignee ?? '').toLowerCase().includes(q) ||
      (task.tags ?? []).some(tag => tag.toLowerCase().includes(q));
    ```
  - `myTasksOnly` と `searchQuery` の両方を AND 条件で適用する

---

## グループN: タスク追加フォームの拡張

- [x] **N-1 インライン作成フォームを複数フィールド対応に拡張**
  - 現在の `<input type="text">` 1行から、以下のフォームに拡張する:
    ```html
    <div class="inline-create">
      <input type="text" class="ic-title" placeholder="タスクタイトル（必須）" />
      <div class="ic-row">
        <select class="ic-priority">
          <option value="low">低</option>
          <option value="medium" selected>中</option>
          <option value="high">高</option>
          <option value="critical">最高</option>
        </select>
        <input type="date" class="ic-due" />
        <input type="text" class="ic-assignee" placeholder="担当者" />
        <input type="text" class="ic-tags" placeholder="タグ (カンマ区切り)" />
      </div>
      <div class="ic-actions">
        <button class="ic-submit" type="button">追加</button>
        <button class="ic-cancel" type="button">キャンセル</button>
      </div>
    </div>
    ```
  - CSS: フォーム全体は `border: 1px solid #ccc; border-radius: 4px; padding: 8px; background: #fff; margin-bottom: 8px;`
  - `.ic-row`: `display: flex; gap: 4px; margin-top: 4px;` 各 input は `flex: 1; font-size: 11px;`

- [x] **N-2 フォーム送信時に全フィールドを送信**
  - 「追加」ボタンクリック または タイトル欄での Enter キーで送信
  - `tags` は `,` で split してトリムした配列に変換
  - 送信メッセージ:
    ```js
    vscode.postMessage({
      type: 'card:create',
      status,
      projectId,
      title,
      priority,
      dueDate: icDue || null,
      assignee: icAssignee || null,
      tags: icTags ? icTags.split(',').map(t => t.trim()).filter(Boolean) : []
    });
    ```
  - Escape または「キャンセル」でフォームをリセット・非表示

- [x] **N-3 extension.ts の createTask コマンドで全フィールドを受け取る**
  - コマンドの `input` 型に `priority?`, `assignee?`, `dueDate?`, `tags?` を追加する
  - `commands['taskDock.createTask']` 呼び出し時にこれらを渡す（未指定はデフォルト値を使用）
  - `isCardCreateMessage` の型も拡張して新フィールドを含める

---

## グループO: ビュー切り替え（カンバン / リスト）

- [x] **O-1 ビュー切り替えタブの追加**
  - ツールバー右端にタブボタンを追加する:
    ```html
    <div class="view-switcher">
      <button id="view-kanban" class="view-tab active" type="button">カンバン</button>
      <button id="view-list" class="view-tab" type="button">リスト</button>
    </div>
    ```
  - CSS: `.view-tab { border: 1px solid #ccc; padding: 4px 10px; background: #f7f7f7; cursor: pointer; }` / `.view-tab.active { background: #007acc; color: #fff; border-color: #007acc; }`
  - クリックで `currentView = 'kanban' | 'list'` を切り替え `renderView()` を呼ぶ
  - `<section class="board">` と `<section class="list-view">` の表示/非表示を `display:none` で切り替える

- [x] **O-2 リストビューの実装**
  - スクリーンショットに倣い、以下の列を持つ階層テーブルを実装する:
    - **Title**: 階層インデント（parentTaskId によるネスト）+ ステータスアイコン
    - **Status**: `Todo` / `In Progress` / `Blocked` / `Done` のバッジ
    - **Assignee**: 頭文字アバター（カンバンカードと同一の表示）
    - **Priority**: 優先度バッジ（カンバンカードと同一）
    - **Due**: 期限日（期限切れは赤文字）
    - **Progress**: サブタスクがある場合 `完了数/総数` を表示（`hasChildren` を利用）
  - HTML構造:
    ```html
    <section class="list-view" style="display:none">
      <table class="task-table">
        <thead>
          <tr>
            <th>Title</th><th>Status</th><th>Assignee</th>
            <th>Priority</th><th>Due</th><th>Progress</th>
          </tr>
        </thead>
        <tbody class="task-rows"></tbody>
      </table>
    </section>
    ```
  - `renderList()` 関数を追加し、ルートタスク（`parentTaskId === null`）を表示する
  - 各行は `<tr data-task-id="...">` で構成し、クリックで `card:open` メッセージを送信（L-4 と連携）
  - サブタスクは親行の直後にインデントして表示（現状 `hasChildren` フラグのみのため、展開は将来拡張）

- [x] **O-3 リストビューでも検索・マイタスクフィルターを適用**
  - `renderList()` でも `searchQuery` / `myTasksOnly` の同一フィルタを通す

---

## グループP: その他改善

- [x] **P-1 カードクリックで詳細ビューを開く**
  - カード本体（ボタン以外の領域）クリック時に `vscode.postMessage({ type: 'card:open', taskId })` を送信する
  - `extension.ts` 側で `isCardOpenMessage` 型ガードを追加し `taskDock.openTaskDetail` コマンドを呼び出す
  - `card:open` メッセージは `isCardMenuMessage` の前に評価する

- [x] **P-2 ドラッグ中のカラムハイライト**
  - `dragover` イベントで対象カラムに `drag-over` クラスを付与し、他カラムからは外す
  - CSS: `.column.drag-over { background: #f0f7ff; outline: 2px dashed #2196F3; }`
  - `dragleave` / `drop` で `drag-over` クラスを除去する

---

## 着手順

```
L-1 → L-2 → L-3 → M-1 → M-2 → N-1 → N-2 → N-3 → O-1 → O-2 → O-3 → P-1 → P-2
```

L-1〜L-3 のバグ修正を先に行い動作確認した後、機能追加へ進む。

---

## 技術上の注意点

- `board-webview-panel.ts` の `buildHtml()` が肥大化するため、HTML テンプレートを変数に分割するリファクタを検討してよい（タスクスコープ外だが歓迎）
- `projectId` の埋め込みは `JSON.stringify` でエスケープする: `` `let projectId = ${JSON.stringify(projectId)};` ``
- リストビューの Progress はサーバーから完了サブタスク数を取得していないため、`hasChildren` フラグで「サブタスクあり」を示すのみとし、パーセント表示は将来拡張とする
- `card:open` と `card:menu` はイベント委譲（`event.target` を確認）で区別する。`button[data-action="menu"]` に `event.stopPropagation()` を追加してカードクリックと干渉しないようにする
