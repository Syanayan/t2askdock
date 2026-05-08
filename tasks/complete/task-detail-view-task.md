# タスク詳細表示・編集パネル 実装タスク

> 目的: `taskDock.openTaskDetail` コマンドで開くWebviewを、現在の最小HTML表示から
> 本格的な詳細表示・編集画面に置き換える。

---

## 現状

`src/extension.ts` L486-500 の `taskDock.openTaskDetail` コマンドは
タイトル・status・priority・tagsのみを素のHTMLで表示しており、
編集機能・サブタスク・コメントはすべて未実装。

---

## 既存の利用可能なリソース

| リソース | 場所 | 用途 |
|---------|------|------|
| `TaskDetail` 型 | `src/core/ports/repositories/task-repository.ts` L18 | `taskId, projectId, title, status, priority, dueDate, tags, description, assignee, parentTaskId, version, progress` |
| `findDetailById` | `appContainer.buildTaskOperator()` | タスク詳細取得 |
| `listSubtasksByParent` | `appContainer.buildProjectTaskLoader()` | サブタスク一覧 (`taskId, title, status, priority, hasChildren`) |
| `UpdateTaskUseCase` | `useCases.updateTaskUseCase` | タスク更新 |
| `MoveTaskStatusUseCase` | `useCases.moveTaskStatusUseCase` | ステータス変更（サブタスクのチェックに使用） |
| `ListTaskCommentsUseCase` | `useCases.listTaskCommentsUseCase` | コメント一覧 |
| `AddTaskCommentUseCase` | `useCases.addTaskCommentUseCase` | コメント追加 |
| `CommentRow` 型 | `src/core/ports/repositories/comment-repository.ts` | `commentId, taskId, body, createdBy, createdAt, updatedAt, deletedAt` |

> **注意**: `TaskDetail` に `createdAt` は含まれない。仕様書の「Created At」表示は別タスクで対応。

---

## グループA: 新規パネルクラスの骨格

- [ ] **A-1 `TaskDetailWebviewPanel` クラスの作成**

  **ファイル**: `src/ui/webview/task-detail-webview-panel.ts`（新規作成）

  ```ts
  export class TaskDetailWebviewPanel {
    private messageListenerDisposable: vscode.Disposable | undefined;

    public constructor(
      private readonly findDetailById: (taskId: string) => Promise<TaskDetail | null>,
      private readonly listSubtasks: (parentTaskId: string) => Promise<SubtaskItem[]>,
      private readonly listComments: (taskId: string) => Promise<ReadonlyArray<CommentRow>>,
      private readonly updateTaskUseCase: UpdateTaskUseCase,
      private readonly moveTaskStatusUseCase: MoveTaskStatusUseCase,
      private readonly addCommentUseCase: AddTaskCommentUseCase,
      private readonly executeCommand: (cmd: string, args?: unknown) => Promise<unknown>
    ) {}

    public async render(
      panel: Pick<vscode.WebviewPanel, 'webview' | 'title'>,
      taskId: string
    ): Promise<void>
  }
  ```

  型エイリアス `SubtaskItem`:

  ```ts
  type SubtaskItem = { taskId: string; title: string; status: TaskStatus; priority: Priority; hasChildren: boolean };
  ```

- [ ] **A-2 `render` メソッドの実装**

  1. `findDetailById(taskId)` でタスク詳細を取得（null なら早期 return）
  2. `listSubtasks(taskId)` でサブタスク一覧を取得
  3. `listComments(taskId)` でコメント一覧を取得
  4. `panel.title` = `Task: ${detail.title}` にセット
  5. `panel.webview.html` = `buildHtml(detail, subtasks, comments)` をセット
  6. `messageListenerDisposable?.dispose()` で前回のリスナーを解除してから再登録
  7. メッセージハンドラを `onDidReceiveMessage` で登録（グループC・D で詳述）

- [ ] **A-3 `extension.ts` のコマンド差し替え**

  **ファイル**: `src/extension.ts` L486-500

  現在の `panel.webview.html = ...` の行を以下に置き換える:

  ```ts
  const detailPanel = new TaskDetailWebviewPanel(
    (id) => appContainer.buildTaskOperator().findDetailById(id),
    (parentId) => appContainer.buildProjectTaskLoader().listSubtasksByParent(parentId),
    (id) => useCases.listTaskCommentsUseCase.execute({ taskId: id }),
    useCases.updateTaskUseCase,
    useCases.moveTaskStatusUseCase,
    useCases.addTaskCommentUseCase,
    async (cmd, args) => vscode.commands.executeCommand(cmd, args)
  );
  await detailPanel.render(panel, taskId);
  ```

  `taskId` は `item.taskId`（`{ taskId }` 形式）と `item.id`（`TaskTreeItem` 形式）の両パスで取得済みのため、
  既存の分岐（L487の `'taskId' in item` チェック）を統一してコードを整理する。

---

## グループB: 閲覧モード HTML/CSS

- [ ] **B-1 2カラムレイアウト**

  ```html
  <div class="detail-layout">
    <div class="detail-main">   <!-- 左70% -->
      <!-- B-2 Description, B-3 Subtasks, B-4 Comments -->
    </div>
    <aside class="detail-side"> <!-- 右30% -->
      <!-- B-5 Properties -->
    </aside>
  </div>
  ```

  ```css
  .detail-layout { display: flex; gap: 16px; flex-wrap: wrap; }
  .detail-main   { flex: 7; min-width: 0; }
  .detail-side   { flex: 3; min-width: 200px; }
  ```

  テーマ変数（固定色を使わない）:
  - 背景: `var(--vscode-editor-background)`
  - 文字: `var(--vscode-editor-foreground)`
  - ボーダー: `var(--vscode-panel-border)`
  - セクション背景: `var(--vscode-sideBar-background)`

- [ ] **B-2 ヘッダーエリア**

  ```html
  <header class="detail-header">
    <h1 class="detail-title view-only">{title}</h1>
    <input class="detail-title edit-only" type="text" name="title" value="{title}" />
    <div class="detail-meta">
      <span class="badge status-{status}">{statusLabel}</span>
      <span class="badge priority-{priority}">{priorityLabel}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:{progress}%"></div></div>
      <span class="progress-label">{progress}%</span>
    </div>
    <div class="detail-actions">
      <button id="btn-edit" class="view-only">Edit</button>
      <button id="btn-save" class="edit-only">Save</button>
      <button id="btn-cancel" class="edit-only">Cancel</button>
      <button id="btn-close">✕</button>
    </div>
  </header>
  ```

  CSS でモード切替:

  ```css
  body.editing .view-only { display: none; }
  body:not(.editing) .edit-only { display: none; }
  ```

- [ ] **B-3 Description（マークダウン表示）**

  外部 CDN 不可のため、インライン軽量パーサーを HTML 内 `<script>` に埋め込む。
  対応構文: `#` 見出し、`**bold**`、`*italic*`、`` `code` ``、`- リスト`、`[text](url)`

  ```js
  const md2html = (src) => {
    if (!src) return '<em>(説明なし)</em>';
    return src
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="#" data-path="$2">$1</a>')
      .replace(/\n\n/g, '</p><p>');
  };
  ```

  - 閲覧モード: `<div class="description-view view-only">` に `innerHTML = md2html(detail.description)`
  - 編集モード: `<textarea class="description-edit edit-only">` に生マークダウン

- [ ] **B-4 サブタスク一覧**

  閲覧モードでもチェックボックスを即時更新可能にする（仕様書 4.1 に準拠）。

  ```html
  <section class="subtasks-section">
    <h3>サブタスク ({done}/{total})</h3>
    <ul class="subtask-list">
      <!-- subtasks.map で生成 -->
      <li class="subtask-item" data-task-id="{sub.taskId}">
        <input type="checkbox" class="subtask-check" {checked} />
        <span class="subtask-title">{sub.title}</span>
        <span class="badge status-{sub.status}">{statusLabel}</span>
      </li>
    </ul>
  </section>
  ```

  チェック変更時:

  ```js
  checkbox.addEventListener('change', () => {
    vscode.postMessage({
      type: 'detail:subtask:toggle',
      taskId: item.dataset.taskId,
      newStatus: checkbox.checked ? 'done' : 'todo'
    });
  });
  ```

  サブタスクが0件のときはセクションを非表示にする。

- [ ] **B-5 コメント/アクティビティ**

  ```html
  <section class="comments-section">
    <h3>コメント</h3>
    <ul class="comment-list">
      <!-- comments.filter(c => !c.deletedAt).map で生成 -->
      <li class="comment-item">
        <div class="comment-meta">
          <span class="comment-author">{c.createdBy}</span>
          <span class="comment-date">{formatDate(c.createdAt)}</span>
        </div>
        <div class="comment-body">{escape(c.body)}</div>
      </li>
    </ul>
    <div class="comment-add">
      <textarea class="comment-input" placeholder="コメントを追加..."></textarea>
      <button id="btn-comment-add">送信</button>
    </div>
  </section>
  ```

- [ ] **B-6 サイドプロパティパネル**

  `<dl>` の `<dt>` / `<dd>` で表示・編集を両立する:

  | 項目 | 閲覧表示 | 編集UI |
  | ---- | ------- | ------ |
  | 担当者 | テキスト | `<input type="text">` |
  | 期限 | `toLocaleDateString` | `<input type="date">` |
  | 優先度 | バッジ | `<select>` |
  | ステータス | バッジ | `<select>` |
  | 進捗 | `N%` | `<input type="range">` |
  | タグ | カンマ区切り | `<input type="text">` |

  `null` の項目は `—` を表示。

---

## グループC: 編集モードのメッセージハンドラ

- [ ] **C-1 Edit ボタン（閲覧→編集への切り替え）**

  ```js
  document.getElementById('btn-edit').addEventListener('click', () => {
    document.body.classList.add('editing');
  });
  ```

  `body.editing` クラスの付与だけで、`view-only` / `edit-only` の CSS が切り替わる。
  編集前の値を JS 変数 `originalDetail` に保持しておく。

- [ ] **C-2 Save 実行**

  Webview → TS の `detail:save` メッセージ:

  ```js
  document.getElementById('btn-save').addEventListener('click', () => {
    vscode.postMessage({
      type: 'detail:save',
      title, description, status, priority, assignee, dueDate, tags, progress
    });
  });
  ```

  ホスト側（TS）で `updateTaskUseCase.execute(...)` を呼び、成功後に `render(panel, taskId)` を再実行してパネルを更新する。
  失敗時は `panel.webview.postMessage({ type: 'detail:error', message })` でWebview内にエラーバナーを表示する。

- [ ] **C-3 Cancel（変更の破棄）**

  ```js
  document.getElementById('btn-cancel').addEventListener('click', () => {
    document.body.classList.remove('editing');
    resetEditFields(originalDetail); // 保存しておいた値でフォームを復元
  });
  ```

  TS へのメッセージ送信は不要（クライアントサイドのみで完結）。

- [ ] **C-4 サブタスクのチェック即時更新**

  ホスト側で `detail:subtask:toggle` を受信し `moveTaskStatusUseCase.execute(...)` を呼ぶ。
  UI の楽観的更新は Webview 側で完了しているため再レンダリングは不要。

  > **注意**: `listSubtasksByParent` の戻り型に `version` が含まれない。
  > 実装時に `findDetailById(sub.taskId)` でversionを補完するか、
  > use case 側で `expectedVersion` を optional にする修正を検討すること。

- [ ] **C-5 コメント追加**

  ホスト側で `detail:comment:add` を受信し `addCommentUseCase.execute(...)` を呼ぶ。
  成功後はコメント一覧を再取得して `panel.webview.postMessage({ type: 'detail:comments:refresh', comments })` で更新する。
  `commentId` は `crypto.randomUUID()` で生成する。

---

## グループD: VSCode連携・仕上げ

- [ ] **D-1 ファイルパスリンク（Description内）**

  `md2html` が生成した `<a data-path="...">` のクリックを処理:

  ```js
  document.querySelector('.description-view').addEventListener('click', (e) => {
    const a = e.target.closest('[data-path]');
    if (!a) return;
    e.preventDefault();
    vscode.postMessage({ type: 'detail:file:open', path: a.dataset.path });
  });
  ```

  ホスト側で `vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path))` を呼ぶ。

- [ ] **D-2 パネル重複防止（`detailPanels` Map 管理）**

  ```ts
  const detailPanels = new Map<string, vscode.WebviewPanel>();

  // openTaskDetail コマンド内
  let panel = detailPanels.get(taskId);
  if (panel) { panel.reveal(); return; }
  panel = vscode.window.createWebviewPanel(...);
  detailPanels.set(taskId, panel);
  panel.onDidDispose(() => detailPanels.delete(taskId));
  ```

- [ ] **D-3 Close ボタン**

  Webview から `detail:close` メッセージを送信し、ホスト側で `panel.dispose()` を呼ぶ。

- [ ] **D-4 単体テストの追加**

  ファイル: `test/unit/task-detail-webview-panel.spec.ts`

  テスト項目:
  - `render` 後に `webview.html` が `detail-layout` / `detail-main` / `detail-side` を含む
  - `webview.html` が `--vscode-editor-background` を含む（テーマ変数使用確認）
  - `detail:subtask:toggle` メッセージで `moveTaskStatusUseCase.execute` が呼ばれる
  - `detail:save` メッセージで `updateTaskUseCase.execute` が呼ばれる
  - `detail:comment:add` メッセージで `addCommentUseCase.execute` が呼ばれる
  - `detail:close` メッセージで `panel.dispose` が呼ばれる

---

## 実装順序

```
A-1 → A-2 → A-3（最小動作確認）
→ B-1 → B-2 → B-6（レイアウト確立）
→ B-3 → B-4 → B-5（コンテンツ充実）
→ C-1 → C-2 → C-3（編集モード）
→ C-4 → C-5（即時更新）
→ D-1 → D-2 → D-3 → D-4（仕上げ）
```

---

## 別タスクとして保留

| 項目 | 理由 |
|------|------|
| `createdAt` の表示 | `TaskDetail` 型と `findDetailById` の SQL に `created_at` が含まれていない。スキーマ変更が必要 |
| Related Files | 現在 DB スキーマに存在しない。新テーブル追加が必要 |
| Codicon アイコン | Webview に `extensionUri` を渡す設定変更が必要。現在の webview 構成では未対応 |

---

## 技術上の注意点

- `md2html` 内で `&`, `<`, `>` を先にエスケープしてからタグを注入すること（XSS防止）
- `moveTaskStatusUseCase.execute` の `expectedVersion` 問題: サブタスクの version が不明な場合は `findDetailById` を呼ぶか、use case 側で optional にする修正を検討する
- CSS の `flex-wrap: wrap` で Webview 幅が狭い場合（< 500px）は自動的に縦並びにする
- `acquireVsCodeApi()` は Webview 内で1回だけ呼ぶこと（複数呼び出しは例外になる）
