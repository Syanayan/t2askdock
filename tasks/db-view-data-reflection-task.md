# DBビューデータ反映タスク

複数DB対応のビュー実装後、各ビューで正しいDBのデータが使われていない問題の修正タスク。

---

## 背景

`openDbTable` コマンドにより新たなテーブルビューが開けるようになったが、ボードや詳細画面で `profileId` が正しく引き継がれていないため、別DBのデータが表示・更新される問題がある。

---

## タスク一覧

### A: ボードからのタスク詳細表示に `profileId` を渡す

**状態**: [ ] 未着手

**問題**:
`BoardWebviewPanel` がカードクリック時に `taskDock.openTaskDetail` を呼ぶが `profileId` を含まない。
```ts
await this.executeCommand('taskDock.openTaskDetail', { taskId: message.taskId })
// profileId が渡されない
```

**修正方針**:
`extension.ts` の `openBoard` 内でボードの `executeCommand` コールバックを定義する際、`taskDock.openTaskDetail` の場合に `currentBoardProfileId` を注入する。

```ts
async (command, args) => {
  if (command === 'taskDock.openTaskDetail' && currentBoardProfileId) {
    return vscode.commands.executeCommand(command, {
      ...(args as Record<string, unknown>),
      profileId: currentBoardProfileId
    });
  }
  return vscode.commands.executeCommand(command, args);
}
```

**対象ファイル**: `src/extension.ts` — `openBoard` コマンド内

---

### B: ボード上のステータス変更を正しいDBに反映する

**状態**: [ ] 未着手

**問題**:
`BoardWebviewPanel` のドラッグ&ドロップ時に `this.moveTaskStatusUseCase.execute()` を直接呼ぶが、このユースケースは `activeClientHolder` の現在のクライアントを参照する。ボードが別DBを表示中でも、デフォルトDBへの書き込みが発生する。

**修正方針**:
1. `BoardWebviewPanel` コンストラクタの `moveTaskStatusUseCase` 型を `Pick<MoveTaskStatusUseCase, 'execute'>` に変更する。
2. `extension.ts` 内でボード作成時に、`withProfileClient` でラップしたオブジェクトを渡す。

```ts
// extension.ts: openBoard内
const boardPanel = new BoardWebviewPanel(
  ...,
  {
    execute: (input) =>
      withProfileClient(currentBoardProfileId, () =>
        useCases.moveTaskStatusUseCase.execute(input)
      ),
  } satisfies Pick<MoveTaskStatusUseCase, 'execute'>,
  ...
);
```

**対象ファイル**:
- `src/ui/webview/board-webview-panel.ts` — コンストラクタ型変更
- `src/extension.ts` — `openBoard` 内の `BoardWebviewPanel` 生成箇所

---

### C: ボードからのタスク作成に `profileId` を渡す

**状態**: [ ] 未着手

**問題**:
`BoardWebviewPanel` がカード作成時に `taskDock.createTask` を呼ぶが `profileId` を含まない。
```ts
await this.executeCommand('taskDock.createTask', createArgs)
// profileId が渡されない
```

**修正方針**:
タスクAと同様、`executeCommand` コールバックで `taskDock.createTask` の場合も `currentBoardProfileId` を注入する。

```ts
async (command, args) => {
  if (
    (command === 'taskDock.openTaskDetail' || command === 'taskDock.createTask')
    && currentBoardProfileId
  ) {
    return vscode.commands.executeCommand(command, {
      ...(args as Record<string, unknown>),
      profileId: currentBoardProfileId
    });
  }
  return vscode.commands.executeCommand(command, args);
}
```

**対象ファイル**: `src/extension.ts` — `openBoard` コマンド内（タスクAと同じ箇所）

> **注**: タスクAと同じコールバックで対応できるため、A・C はまとめて実装する。

---

### D: 複数のDBテーブルパネルが同時に開くと競合する

**状態**: [ ] 未着手

**問題**:
`taskDock.openDbTable` は `activeClientHolder.switch()` でグローバルなクライアントを切り替える。
複数のパネルが同時に開いていると、後に開いたパネルが前のパネルのクライアントを上書きし、前のパネルの操作が誤ったDBに対して行われる。

また、現在 `tablePanel` は `extension.ts` に1つしか存在しないため、パネルを複数開いてもクエリが同じインスタンスを共有する。

**修正方針**:
1. `TaskTableWebviewPanel` のユースケースパラメータを `Pick<..., 'execute'>` 型に変更する。
2. `taskDock.openDbTable` コマンド内で、パネルごとに `withProfileClient` でラップした専用のユースケース群を生成して渡す。
3. `activeClientHolder.switch()` を使わず、パネルに渡したコールバック経由で対象DBにアクセスする。

```ts
// extension.ts: taskDock.openDbTable 内
const profileId = item.profileId;
const makeTableUseCases = () => ({
  listTasksUseCase: {
    execute: (input: Parameters<typeof useCases.listTasksUseCase.execute>[0]) =>
      withProfileClient(profileId, () => useCases.listTasksUseCase.execute(input)),
  },
  // ... 他の必要なユースケース
});

const panel = new TaskTableWebviewPanel(makeTableUseCases(), ...);
const webviewPanel = vscode.window.createWebviewPanel(...);
await panel.render(webviewPanel);
```

**対象ファイル**:
- `src/ui/webview/task-table-webview-panel.ts` — コンストラクタ型変更
- `src/extension.ts` — `openDbTable` コマンド登録箇所

---

### E: タスク詳細画面からサブタスク作成時に `profileId` を引き継ぐ

**状態**: [ ] 未着手

**問題**:
`TaskDetailWebviewPanel` が `executeCommand` を呼ぶ際、サブタスク作成コマンドに `profileId` を渡していない。
```ts
await this.executeCommand('taskDock.createSubtask', { taskId: ... })
// profileId が渡されない
```

**修正方針**:
`TaskDetailWebviewPanel` に `profileId` フィールドを追加し、`executeCommand` 経由のコマンド呼び出し時に注入する。

または、`extension.ts` 側の `openTaskDetail` 内で `executeCommand` コールバックを定義する際に、`taskDock.createSubtask` の引数へ `profileId` を自動注入する。

```ts
// extension.ts: openTaskDetail 内
const detailPanel = new TaskDetailWebviewPanel(
  ...,
  async (cmd, args) => {
    const profileAwareCommands = [
      'taskDock.createSubtask',
      'taskDock.openTaskDetail',
    ];
    if (profileAwareCommands.includes(cmd) && profileId) {
      return vscode.commands.executeCommand(cmd, {
        ...(args as Record<string, unknown>),
        profileId,
      });
    }
    return vscode.commands.executeCommand(cmd, args);
  }
);
```

**対象ファイル**: `src/extension.ts` — `openTaskDetail` コマンド内の `executeCommand` コールバック

---

## 実装順序

1. **A + C** (同じコールバック修正) → ボードからの詳細表示とタスク作成が正しいDBを向く
2. **B** → ボードでのステータス変更が正しいDBに書き込まれる
3. **E** → 詳細画面からのサブタスク作成で profileId が引き継がれる
4. **D** → 複数パネル競合の根本的解消（最も影響範囲が大きい）

---

## 完了条件

- [ ] A: あるDBのボードを開いた状態でカードをクリックすると、同じDBのタスク詳細が表示される
- [ ] B: ボード上でカードをドラッグ&ドロップすると、表示中のDBのタスクステータスが変わる
- [ ] C: ボードの「タスク追加」ボタンから作成したタスクが、表示中のDBのカテゴリに作成される
- [ ] D: 2つ以上のDBテーブルパネルを同時に開いても、それぞれ独立したDBのデータを表示する
- [ ] E: タスク詳細画面の「サブタスク作成」から作成したサブタスクが、同じDBに保存される
