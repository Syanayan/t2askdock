# カンバンボード Phase 4 / テーマ対応・安定性改善タスク

> 目的: VSCode テーマへの追従・フラットデザイン化・タスク追加後の即時反映・
> ボード復帰時のタスク消失防止を実装する。

---

## 現状との差分サマリー

| 項目 | 現状 | 目標 |
|------|------|------|
| カラーテーマ | 固定 hex 色（ライト/ダーク両方で見づらい） | VSCode テーマ変数に追従 |
| デザイン | カード・テーブルにシャドウあり | フラット（ボーダー基調） |
| タスク追加後 | 手動でボードを開き直すまで反映されない | 追加直後にボードを再描画 |
| ボード復帰時 | タスクがすべて消えて空白になる | 前回のタスク一覧を復元して表示 |

---

## グループV: VSCode テーマ対応

- [ ] **V-1 ハードコード色を VSCode テーマ変数に置き換える**
  - `board-webview-panel.ts` の CSS 内ハードコード色を以下の変数に置き換える:
    - 背景全体: `var(--vscode-editor-background)`
    - 前景テキスト: `var(--vscode-editor-foreground)`
    - ボーダー色: `var(--vscode-panel-border)`
    - ホバー背景: `var(--vscode-list-hoverBackground)`
    - ボタン背景: `var(--vscode-button-background)`
    - ボタン前景: `var(--vscode-button-foreground)`
    - 入力背景: `var(--vscode-input-background)`
    - 入力ボーダー: `var(--vscode-input-border)`
    - 入力前景: `var(--vscode-input-foreground)`
    - テーブルヘッダー: `var(--vscode-keybindingTable-headerBackground)`
    - テーブル偶数行: `var(--vscode-keybindingTable-rowsBackground)`

- [ ] **V-2 ステータスバッジ色をテーマに沿わせる**
  - `.status-todo / .status-in_progress / .status-done / .status-blocked` の
    `background` / `color` / `border` を VSCode テーマ変数または
    セマンティックな相対色に変更する
  - 変数が存在しない場合は `color-mix()` または透過色を使い、
    テーマ色から派生させる（例: `rgba(var(--blue-rgb, 29,78,216), 0.15)`）
  - 簡易対応として `filter: brightness()` + `opacity` での調整も可
  - ライト/ダーク両方でコントラスト比が 4.5:1 以上になることを目安とする

---

## グループW: フラットデザイン

- [ ] **W-1 カードのシャドウをボーダーに変更**
  - `.task` の `box-shadow` を削除し、`border: 1px solid var(--vscode-panel-border)` に変更する
  - `:hover` の `box-shadow` と `transform: translateY(-1px)` も削除する
  - ホバーは `background: var(--vscode-list-hoverBackground)` で表現する

- [ ] **W-2 テーブルのシャドウをボーダーに変更**
  - `.task-table-wrap` の `box-shadow` を削除し、
    `border: 1px solid var(--vscode-panel-border)` に変更する

- [ ] **W-3 インライン作成フォームのシャドウをボーダーに変更**
  - `.inline-create` の `box-shadow` を削除し、
    `border: 1px solid var(--vscode-input-border)` に変更する

---

## グループX: タスク追加後の即時反映

- [ ] **X-1 openBoard の boardTask 取得ロジックを関数に切り出す**
  - `extension.ts` の `taskDock.openBoard` コマンド内にある「プロジェクト→タスク一覧→詳細取得」の
    ロジックを `fetchBoardTasks(projectId?: string): Promise<BoardTask[]>` として切り出す
  - `boardPanel.render()` の呼び出し箇所もこの関数を使う
  - 切り出した関数を `openBoard` コマンドハンドラと `TASK_UPDATED` ハンドラの両方から呼べるようにする

- [ ] **X-2 TASK_UPDATED 時にボードを再描画する**
  - `extension.ts` の `TASK_UPDATED` イベントハンドラに以下を追加する:
    ```ts
    const disposeTaskUpdated = eventBus.subscribe('TASK_UPDATED', async () => {
      myRecentTasksProvider.refresh();
      allProjectsProvider.refresh();
      if (boardWebviewPanel) {
        const boardTasks = await fetchBoardTasks(currentBoardProjectId);
        boardPanel.render(boardWebviewPanel, boardTasks);
      }
    });
    ```
  - `currentBoardProjectId` は `openBoard` 呼び出し時に `let currentBoardProjectId: string | undefined`
    として保存する（全プロジェクト表示の場合は `undefined`）
  - `boardPanel.render()` が重複ハンドラを起こさないよう、
    既存の `messageListenerDisposable?.dispose()` が正しく動作することを確認する（Phase 3 で対応済み）
  - `createTask` コマンドはすでに `eventBus.publish({ type: 'TASK_UPDATED' })` を発行しているかを確認し、
    していない場合は `commands['taskDock.createTask']` の後に追加する

- [ ] **X-3 createTask コマンドが TASK_UPDATED を発行することを確認・修正**
  - `extension.ts` の `taskDock.createTask` コマンドハンドラ内で
    `commands['taskDock.createTask']` が完了した後に
    `eventBus.publish({ type: 'TASK_UPDATED', payload: { taskId: ... } })` を呼び出しているか確認する
  - 呼び出していない場合は追加する（`updateTask` / `deleteTask` と同様のパターン）

---

## グループY: ボード復帰時のタスク消失防止

- [ ] **Y-1 boardWebviewPanel に retainContextWhenHidden を設定する**
  - `extension.ts` の `vscode.window.createWebviewPanel(...)` に
    `retainContextWhenHidden: true` オプションを追加する:
    ```ts
    boardWebviewPanel = vscode.window.createWebviewPanel(
      BoardWebviewPanel.VIEW_TYPE,
      'Task Dock Board',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ```
  - これにより、パネルが非アクティブになっても JS コンテキスト（`tasks` 配列・`currentView` 等）が
    保持されるため、ボードタブに戻った際にタスクが消えなくなる
  - メモリ使用量は増えるが、タスク一覧が数百件を超えるような規模ではないため許容範囲内

- [ ] **Y-2 パネルが再表示された時に board:init を再送する（Y-1 の補完）**
  - `Y-1` だけで解決しない場合（VS Code の実装依存）の保険として、
    `boardWebviewPanel.onDidChangeViewState` イベントを購読し、
    パネルが `active` になった際に `boardPanel.render()` を再呼び出しする:
    ```ts
    boardWebviewPanel.onDidChangeViewState(({ webviewPanel }) => {
      if (webviewPanel.active && boardWebviewPanel) {
        void fetchBoardTasks(currentBoardProjectId).then(tasks => {
          boardPanel.render(boardWebviewPanel!, tasks);
        });
      }
    });
    ```
  - X-1 で切り出した `fetchBoardTasks` を再利用する

---

## 着手順

```
V-1 → V-2 → W-1 → W-2 → W-3 → X-1 → X-2 → X-3 → Y-1 → Y-2
```

V・W はUI変更で独立しているため先に完了させる。
X-1 はリファクタなので X-2・Y-2 の前提として先に行う。
Y-1 は単一行の変更で手軽なため X と並行で実施してよい。
Y-2 は Y-1 で解決しなかった場合のみ実施する。

---

## 技術上の注意点

- **V-1 変数の有効範囲**: `var(--vscode-*)` 変数は Webview 内で自動的に注入される。
  VS Code 側でテーマが変わると Webview の CSS 変数も自動更新されるため、JS での動的変更は不要。
- **V-2 ステータス色**: `--vscode-charts-blue` / `--vscode-charts-green` / `--vscode-charts-red` /
  `--vscode-charts-yellow` が利用可能。これらはテーマ対応済みのため積極的に使う。
- **X-2 非同期 TASK_UPDATED ハンドラ**: `eventBus.subscribe` のコールバックが `async` の場合、
  エラーをキャッチしないと unhandled rejection になる。`try/catch` または `.catch(console.error)` を付ける。
- **X-2 render() の重複呼び出し**: TASK_UPDATED は updateTask・deleteTask でも発行される。
  ボードが開いている場合はそのたびに re-fetch + re-render が走る。
  タスク数が多い場合はデバウンスを検討するが、初期実装では不要。
- **Y-1 retainContextWhenHidden のコスト**: パネルが閉じられるまで Webview の JS ヒープが保持される。
  タスク一覧程度のデータ量では問題ないが、画像など大きなリソースを持つ場合は注意。
