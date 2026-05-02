# カンバンボード Phase 3 / UX 改善タスク

> 目的: リストビューの機能充実・ステータス色の統一・サイドバーの重複修正・
> ビュー状態の永続化・モダンなUIへのリフレッシュを行う。

---

## 現状との差分サマリー

| 項目 | 現状 | 目標 |
|------|------|------|
| デフォルトビュー | カンバン | リスト |
| リストのサブタスク | インデント表示（常時展開） | 親行クリックで展開/折りたたみ |
| リストの Done 表示 | 常時表示 | トグルで切り替え |
| リストのステータス変更 | 不可 | 行内ドロップダウンで変更 |
| ステータス色 | カンバンのみ border-top | カンバン・リスト両方に色バッジ |
| リストのソート | なし | 列ヘッダークリックでソート |
| サイドバーのサブタスク | ルートにも重複表示される | 親の下にのみ表示（ルートから除外） |
| ビュー状態 | 詳細を開くとリセット | 前回のビュー（カンバン/リスト）を復元 |
| UI | 最小限のスタイル | モダン（シャドウ・角丸・明確な色彩） |

---

## グループQ: リストビュー改善

- [ ] **Q-1 デフォルトビューをリストに変更**
  - `board-webview-panel.ts` のJS変数 `let currentView='kanban'` を `let currentView='list'` に変更する
  - `window.addEventListener('message', ...)` 内の初回 `renderView()` はそのまま（list が先に表示される）

- [ ] **Q-2 サブタスクの展開/折りたたみ**
  - `hasChildren === true` の行に展開ボタン `▶` を追加する
  - 展開状態を `const expanded = new Set()` で管理し、ボタンクリックで taskId を追加/削除して `renderList()` を再呼び出しする
  - `addRows(parentId, depth)` は `expanded.has(parentId)` が true の場合のみ子行を描画する
  - 展開ボタンのアイコン: `▶`（折りたたみ）/ `▼`（展開中）
  - ボタンクリック時は `event.stopPropagation()` で行クリック（詳細表示）と干渉しないようにする

- [ ] **Q-3 リストの Done 表示トグル**
  - ツールバーに「Done を表示」ボタンを追加する（カンバンの「折り畳む」と同列）
  - `let showDoneInList = false` を JS 変数として持つ
  - `renderList()` のフィルタに `showDoneInList || task.status !== 'done'` を追加する
  - ボタンのラベルをトグルに合わせて切り替える: `「Done を表示」/ 「Done を隠す」`

- [ ] **Q-4 リスト行でのステータス変更**
  - Status 列のセルに `<select>` を配置する:
    ```html
    <select class="status-select" data-task-id="...">
      <option value="todo">Todo</option>
      <option value="in_progress">In Progress</option>
      <option value="blocked">Blocked</option>
      <option value="done">Done</option>
    </select>
    ```
  - `change` イベントで `vscode.postMessage({ type: 'board:drop', task: {...}, toStatus: newStatus })` を送信する
    （既存の DnD と同じメッセージ形式を使用するため拡張機能側の変更不要）
  - 送信後に `tasks` 配列内の該当タスクの `status` / `version` を楽観的に更新し `renderList()` を呼ぶ
  - `<select>` のクリックは `event.stopPropagation()` で行クリックと干渉しないようにする

- [ ] **Q-5 リスト列ヘッダーのソート**
  - `let listSort = { col: 'title', dir: 'asc' }` を JS 変数として持つ
  - 列ヘッダー `<th>` をクリックするとソート列と方向を切り替えて `renderList()` を呼ぶ
  - 同じ列を再クリックすると `asc` ↔ `desc` を切り替える
  - アクティブ列には `▲` / `▼` アイコンを表示する
  - ソート対象: Title・Status・Priority・Due（Assignee は文字列順）
  - Priority のソート順: `critical > high > medium > low`

---

## グループR: ステータスカラーの統一

- [ ] **R-1 ステータス色定義の共通化**
  - CSS に以下のスタイルを追加する:
    ```css
    .status-todo    { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
    .status-in_progress { background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
    .status-done    { background: #F0FDF4; color: #15803D; border: 1px solid #BBF7D0; }
    .status-blocked { background: #FFF1F2; color: #BE123C; border: 1px solid #FECDD3; }
    ```
  - カンバンのカラム `border-top-color` は現状の色を維持しつつ、カラムヘッダーのバッジにも同じ色クラスを適用する
  - リストビューの Status 列セル（および `<select>` 要素）にも `status-{value}` クラスを動的に付与する
  - カンバンカードのメタ情報エリアにステータスバッジを追加（小さく表示）

---

## グループS: サイドバーツリーの重複修正

- [ ] **S-1 listTasksByProject でルートタスクのみ返す**
  - `src/infra/sqlite/repositories/task-repository.ts` の `listTasksByProject` SQL に
    `AND t.parent_task_id IS NULL` フィルタを追加する
  - 現在はサブタスクもルートレベルに返っているため、allProjects ツリーでサブタスクが
    「プロジェクト直下」と「親タスクの子」の両方に表示されてしまっている
  - `listMyTasks` も同様に `AND t.parent_task_id IS NULL` を追加する
  - 既存テストに影響がある場合は修正する

---

## グループT: ビュー状態の永続化

- [ ] **T-1 WebView の state に currentView を保存**
  - Webview JS 側: `vscode.setState({ currentView })` を `currentView` 変更時に呼び出す
  - 初期化時: `const saved = vscode.getState(); let currentView = saved?.currentView ?? 'list';` で前回状態を復元する
  - これにより `taskDock.openBoard` で同じプロジェクトを再度開いた際（または詳細から戻った際）
    に前回のビュー（カンバン/リスト）が復元される

- [ ] **T-2 openBoard で既存パネルを再利用する**
  - `extension.ts` の `taskDock.openBoard` コマンドで毎回 `createWebviewPanel` している箇所を修正し、
    既存のパネルが生きていれば `reveal()` して `boardPanel.render()` を再呼び出しする
  - パネルの参照を `let boardWebviewPanel: vscode.WebviewPanel | undefined` として `openBoard` の外側で保持する
  - パネルの `onDidDispose` で参照を `undefined` にリセットする
  - これにより詳細ビューから戻っても、ボードパネルがそのまま残る

---

## グループU: モダン UI

- [ ] **U-1 全体ビジュアルのリフレッシュ**
  - **フォント**: `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`
  - **カンバンカード**:
    - `box-shadow: 0 1px 3px rgba(0,0,0,.08);`
    - `border-radius: 8px;`
    - `border: none;` (shadow で代替)
    - ホバー時: `box-shadow: 0 4px 12px rgba(0,0,0,.12); transform: translateY(-1px);`
    - `transition: box-shadow .15s, transform .15s;`
  - **カンバンカラム**:
    - `background: #F8F9FA;`
    - `border-radius: 10px;`
    - `border: none;`
    - `padding: 12px;`
  - **ツールバー**:
    - ボタン: `border-radius: 6px; font-size: 12px; padding: 5px 10px;`
    - 検索: `border-radius: 6px;`
  - **リストテーブル**:
    - `border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06);`
    - 偶数行: `background: #FAFAFA;`
    - ホバー行: `background: #F0F4FF;`
    - ヘッダー: `background: #F1F5F9; font-weight: 600;`
  - **ステータスバッジ**:
    - `border-radius: 999px; font-size: 11px; font-weight: 600; padding: 2px 8px;`
  - **インライン作成フォーム**:
    - `border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.1);`

---

## 着手順

```
S-1 → Q-1 → Q-2 → Q-3 → Q-4 → Q-5 → R-1 → T-1 → T-2 → U-1
```

S-1（サイドバー重複）は独立した修正なので最初に行う。
Q 系はリストビューの機能強化で順番通りに進める。
R-1 はQ完了後にカンバン・リスト両方に一括適用する。
T 系はビュー状態管理で R の後に行う。
U-1 は最後に全体のビジュアルをまとめてリフレッシュする。

---

## 技術上の注意点

- **Q-2 展開状態と `renderList` の関係**: `expanded` Set は `render()` 呼び出しをまたいで保持する。
  `render()` 内で `renderList()` を呼んでいるため、カンバン側の更新でも展開状態が維持される。
- **Q-4 ステータス変更と `board:drop` メッセージ**: `task` オブジェクト内に全フィールドが必要。
  `tasks` 配列から該当タスクを探して `{ ...task, expectedVersion: task.version }` を渡す。
- **S-1 の影響範囲**: `listTasksByProject` にフィルタを追加すると、`openBoard` で取得するタスク一覧からも
  サブタスクが除外される。ボードでサブタスクを表示したい場合は別途対応が必要（今回はスコープ外）。
- **T-2 パネル再利用の注意**: `panel.webview.onDidReceiveMessage` は `render()` のたびに登録される。
  再利用時はメッセージハンドラの重複登録を防ぐため、`render()` 内で返される `Disposable` を
  前回登録分と差し替えるか、一度だけ登録する設計に変更する。
- **U-1**: VSCode の Webview はテーマ変数（`var(--vscode-*)`）を使うとダーク/ライトテーマに対応できる。
  ハードコードの色は固定テーマになるため、将来の改善点として認識しておく。
