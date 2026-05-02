# ボードリストビューでのサブタスク階層表示

> 目的: ボードのリストビュー（テーブル形式）でサブタスクを親子階層として表示できるようにする。
> データ取得からUI表示まで一貫して修正する。

---

## 現状の問題

| 問題 | 箇所 | 詳細 |
|------|------|------|
| サブタスクがデータとして届かない | `src/extension.ts` L139-164 `fetchBoardTasks` | `listTasksByProject` は SQL で `parent_task_id IS NULL` に絞っているため、子タスクが一切含まれない |
| インデントに `&nbsp;` を使用 | `src/ui/webview/board-webview-panel.ts` L80 `renderList` | `'&nbsp;'.repeat(depth*4)` で空白を挿入しており、スタイルでの制御ができない |

---

## タスク一覧

### T-1: `fetchBoardTasks` でサブタスクを再帰的に取得する

**ファイル**: `src/extension.ts`  
**対象行**: 139-164（`fetchBoardTasks` 関数全体）

#### 現状コード（要旨）
```ts
const fetchBoardTasks = async (projectId?: string) => {
  ...
  const tasks = await projectTaskLoader.listTasksByProject({ projectId: project.projectId, offset: 0, limit: 100 });
  return Promise.all(tasks.map(async task => {
    const detail = await taskOperator.findDetailById(task.taskId);
    return { taskId: task.taskId, projectId: ..., version: task.version, hasChildren: task.hasChildren, ... };
  }));
};
const taskOperator = appContainer.buildTaskOperator(); // L165
```

#### やること

`fetchBoardTasks` の内部に再帰ヘルパー `collectSubtasks` を追加し、
`hasChildren: true` の親タスクについて子孫タスクをすべて取得して flat 配列に追加する。

**実装手順:**

1. `fetchBoardTasks` の先頭（`const projects = ...` の前）に以下のヘルパーを定義する:

```ts
const collectSubtasks = async (
  parentTaskId: string,
  projectId: string
): Promise<BoardTask[]> => {
  const subtasks = await projectTaskLoader.listSubtasksByParent(parentTaskId);
  const result: BoardTask[] = [];
  for (const sub of subtasks) {
    const detail = await taskOperator.findDetailById(sub.taskId);
    result.push({
      taskId: sub.taskId,
      projectId,
      title: sub.title,
      status: sub.status,
      priority: sub.priority,
      description: detail?.description ?? null,
      assignee: detail?.assignee ?? null,
      dueDate: detail?.dueDate ?? null,
      tags: detail?.tags ?? [],
      parentTaskId: detail?.parentTaskId ?? parentTaskId,
      version: detail?.version ?? 1,
      hasChildren: sub.hasChildren,
    });
    if (sub.hasChildren) {
      result.push(...await collectSubtasks(sub.taskId, projectId));
    }
  }
  return result;
};
```

> **注意**: `listSubtasksByParent` の TypeScript 戻り型に `version` は含まれないが、
> `findDetailById` が `version` を持つため、そちらから取得する。

2. ルートタスクのマッピング後、`hasChildren: true` のタスクに対して `collectSubtasks` を呼び出す:

```ts
return Promise.all(tasks.map(async task => {
  const detail = await taskOperator.findDetailById(task.taskId);
  const root: BoardTask = {
    taskId: task.taskId,
    projectId: project.projectId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: detail?.description ?? null,
    assignee: detail?.assignee ?? null,
    dueDate: detail?.dueDate ?? null,
    tags: detail?.tags ?? [],
    parentTaskId: detail?.parentTaskId ?? null,
    version: task.version,
    hasChildren: task.hasChildren,
  };
  if (task.hasChildren) {
    const children = await collectSubtasks(task.taskId, project.projectId);
    return [root, ...children];
  }
  return [root];
})).then(groups => groups.flat());
```

> `BoardTask` の型は `board-webview-panel.ts` の `BoardTask` と同形。
> `extension.ts` にはこの型をローカルに定義するか、戻り値をインラインで記述する（既存と同じスタイルに合わせる）。

---

### T-2: `renderList` のインデントを CSS ベースに変更する

**ファイル**: `src/ui/webview/board-webview-panel.ts`  
**対象行**: L80（`renderList` 関数内、`<td>` の innerHTML 組み立て部分）

#### 現状コード（要旨）
```js
tr.innerHTML = '<td>' + ('&nbsp;'.repeat(depth * 4)) + toggle + task.title + '</td><td>...
```

#### やること

`&nbsp;` 空白を除去し、タイトルセルの中身を `<span>` で包んで `padding-left` による CSS インデントに変更する。
深さを示すビジュアルインジケーターも `<span>` で表現する（サブタスクであれば `└` 記号を CSS でレンダリング）。

**実装:**

title 部分を以下のように変更する:

```js
// 変更前
'<td>' + ('&nbsp;'.repeat(depth * 4)) + toggle + task.title + '</td>'

// 変更後
'<td class="task-title-cell"><span class="task-indent" style="display:inline-block;width:' + (depth * 16) + 'px;flex-shrink:0"></span>'
+ (depth > 0 ? '<span class="subtask-connector"></span>' : '')
+ toggle
+ task.title
+ '</td>'
```

**対応する CSS を `<style>` ブロック（L61-69 の範囲）に追加する:**

```css
.task-title-cell{display:flex;align-items:center;gap:2px}
.subtask-connector{display:inline-block;width:12px;height:12px;border-left:2px solid var(--vscode-panel-border);border-bottom:2px solid var(--vscode-panel-border);border-radius:0 0 0 3px;flex-shrink:0;margin-right:2px;vertical-align:middle}
```

これにより:
- インデントは `width:Npx` の空要素で確保（`depth * 16px`）
- サブタスクであれば `└` 形の L 字ボーダーが表示される
- 空白文字は一切使わない

---

### T-3: テストを追加する

**ファイル**: `test/unit/board-webview-panel.spec.ts`

`renderList` が `&nbsp;` を含まず `task-indent` と `subtask-connector` を含むことを確認するテストを追加する。

```ts
it('uses css-based indentation for subtasks, not &nbsp;', () => {
  const panel = new BoardWebviewPanel({ execute: vi.fn() } as never, { publish: vi.fn() } as never, vi.fn());
  const webview = { html: '', postMessage: vi.fn(), onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) };
  panel.render({ title: '', webview }, []);

  expect(webview.html).not.toContain('&amp;nbsp;');
  expect(webview.html).toContain('task-indent');
  expect(webview.html).toContain('subtask-connector');
});
```

---

## 実装順序

`T-1（データ取得）→ T-2（UI表示）→ T-3（テスト）`

T-1 を先に行うことで、実際にサブタスクデータがWebviewに届くようになり、
T-2 の表示確認が実機でできる状態になる。

---

## 技術上の注意点

- `listSubtasksByParent` の戻り型に `version` がないため、必ず `findDetailById` で補完する
- `collectSubtasks` は `taskOperator` を参照するため、`const taskOperator = ...` (L165) より後の呼び出しになっていれば問題ない（`fetchBoardTasks` 関数は実行時に参照するため宣言位置は問わない）
- `collectSubtasks` の再帰は最大深度に上限がないが、実用上は2〜3階層のため許容する
- ボードのカンバンビュー（`render` 関数）はフラット表示なので変更不要。リストビュー（`renderList`）のみが対象
- CSS の `flex` を `task-title-cell` に適用するため、既存の `<td>` スタイルと競合しないか確認する
