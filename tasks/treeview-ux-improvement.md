# ツリービュー UX 改善タスク

> 目的: ホバー時のインラインボタン問題の解消・選択アイテムへのコマンド適用・
> 完了タスクの表示制御を実装し、ツリービューの操作性を向上させる。

---

## グループI: ホバーボタンの無効化

- [ ] **I-1 inline ボタンを右クリックメニューのみに変更**
  - `package.json` の `view/item/context` で `group: "inline"` を `group: "navigation"` に変更する
  - 対象: `taskDock.openTaskDetail`・`taskDock.updateTask`
  - これにより、ホバー時にボタンが出なくなり右クリックが使えるようになる
  - クリック時の Detail 表示は `treeItem.command` で既に実装済みのため変更不要

---

## グループJ: 選択アイテムへのコマンド適用

- [ ] **J-1 `registerTreeDataProvider` → `createTreeView` に移行**
  - `extension.ts` で `vscode.window.registerTreeDataProvider` を
    `vscode.window.createTreeView` に切り替える
  - 戻り値の `TreeView` オブジェクトを変数に保持する（`myRecentTasksView` / `allProjectsView`）
  - `createTreeView` の戻り値は `Disposable` なので `context.subscriptions.push` に追加する

- [ ] **J-2 コマンドが引数なしの場合に選択アイテムを使用**
  - `taskDock.deleteTask` / `taskDock.createSubtask` / `taskDock.updateTask` /
    `taskDock.openTaskDetail` の各コマンドを修正する
  - 引数 `item` が undefined の場合、`myRecentTasksView.selection[0]` または
    `allProjectsView.selection[0]` からアクティブな選択を取得する
  - どちらの View がアクティブか不明な場合は両方を確認し非 undefined の方を使う

---

## グループK: 完了タスクの表示制御

- [ ] **K-1 `allProjects` にトグルボタンを追加（推奨方式）**
  - `package.json` の `view/title` に `taskDock.allProjects.toggleDone` コマンドを追加する
    - アイコン: `$(eye)` （表示時）/ `$(eye-closed)`（非表示時）
    - `when: "view == taskDock.allProjects"`
  - `AllProjectsProvider` に `showDone: boolean` の内部 State を追加する
  - `toggleDone()` メソッドで State を切り替え `refresh()` を呼ぶ
  - `getChildren()` で `showDone === false` の場合は `done` タスクを除外する
    （現状の `excludeDone: true` を State で制御する形に変更）
  - `extension.ts` に `taskDock.allProjects.toggleDone` コマンドを登録する

- [ ] **K-2 トグル状態をアイコンに反映**
  - `showDone` の状態に応じてコマンドのアイコンを切り替えるために
    `vscode.commands.executeCommand('setContext', 'taskDock.showDone', showDone)` を使う
  - `package.json` の `when` 条件で `taskDock.showDone` を参照し
    アイコンを切り替える（`icon` を条件分岐または `$(eye)` 固定でも可）

---

## 着手順

`I-1 → J-1 → J-2 → K-1 → K-2`

I-1 は独立した小さな変更なので最初に対応する。
J-1 は J-2 の前提なので順番通りに実装する。
K-1・K-2 はセットで実装する。

---

## 技術上の注意点

- `createTreeView` の第2引数に `{ treeDataProvider: ... }` を渡す
- `TreeView.selection` は読み取り専用の配列で、選択がない場合は空配列
- どちらの View で右クリックしたか判定するには、コマンドの `arguments` に渡される
  `item` の有無で判断するのが最もシンプル（`item` あり → 右クリック経由、なし → コマンドパレット経由）
- `setContext` を使ったアイコン切り替えは VS Code 1.73+ で利用可能
