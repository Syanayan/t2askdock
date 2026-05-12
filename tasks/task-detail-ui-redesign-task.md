# タスク詳細画面 UI リデザインタスク

> 目的: タスク詳細画面のレイアウトをイメージ案に合わせて再構成する。
> 機能追加は最小限。基本的に `buildHtml()` の HTML/CSS 書き換えと、close+comment の統合のみ。

---

## 対象ファイル

- `src/ui/webview/task-detail-webview-panel.ts`（`buildHtml()` メソッド中心）

---

## 完成イメージ（縦方向）

```
┌─────────────────────────────────────────────────────┐
│ タイトル  [Todo] [Medium]          [Edit]  [×]       │  ← sticky ヘッダー
├─────────────────────────────────────────────────────┤
│ DESCRIPTION                                          │
│ テキスト本文                                         │
├─────────────────────────────────────────────────────┤
│ TASK PROPERTIES                                      │
│  👤 Assignee      田中 太郎  │  📅 Due Date  2024-05-20 │
│  🕒 Last Update   12 mins ago│  🏷 Label  [Bug][Frontend]│
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ COMPLETION PROGRESS 35% │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │
├─────────────────────────────────────────────────────┤
│ 💬 Activity                                          │
│  [佐] 佐藤 美咲  2h ago                             │
│      ログを共有しました。                            │
│  [S]  System  1h ago                                │
│      Status changed to Todo  ← 斜体グレー            │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Type a message...                            │   │
│  └──────────────────────────────────────────────┘   │
│  [close comment]                       [comment]     │
└─────────────────────────────────────────────────────┘
```

---

## T-1: ヘッダー再構成

**変更内容（HTML/CSS のみ）**

- **現状**: タイトルだけのカード（左）＋ Actions パネル（右サイドバー）に分散
- **変更後**: 1本の sticky ヘッダーバーに集約

```
左: タイトル(h2)  [Todo バッジ]  [Medium バッジ]
右: [Edit] ボタン  [×] ボタン（= 現 Dismiss）
```

**削除するボタン:**
- `btn-close-task`（Close Task ボタン）→ T-5 の close comment に移行
- `btn-archive`（Archive ボタン）→ 詳細画面では非表示（一覧から操作）
- `Dismiss` テキストボタン → `×` ボタンに変更

**編集モード時:**
- `[Edit]` → `[Save]` に切り替え（現状と同じ挙動）
- `×` は editing クラスの有無に関わらず常に「パネルを閉じる」

**CSS 要件:**
- `position: sticky; top: 0;` で常に画面上部に固定
- `z-index` でコンテンツの上に重なるようにする

---

## T-2: Description カード

**変更内容（スタイル変更のみ）**

- セクションラベルを `<h3>Description</h3>` → `DESCRIPTION`（uppercase、小文字で鉛筆アイコン付き）
- カードのパディング・丸角は現状維持
- 閲覧モード・編集モード（`view-only`/`edit-only`）の切り替えは現状維持

---

## T-3: Task Properties 統合カード

**変更内容（レイアウト変更）**

現状: 右サイドバーに `Properties` パネル（縦積みフォーム）  
変更後: Description の下に横並び2列の統合カードを配置

**カード構造:**
```
TASK PROPERTIES  ← uppercase セクションラベル
─────────────────────────────────────
👤 Assignee  [値]  │  📅 Due Date  [値]
─────────────────────────────────────
🕒 Last Update [相対時刻]  │  🏷 Label  [タグチップ列]
─────────────────────────────────────
COMPLETION PROGRESS                35%
[━━━━━━━━░░░░░░░░░░] ← <progress> タグ or div
```

**相対時刻の生成:**
- `updatedAt` から現在時刻との差分を "N mins ago" / "N h ago" / "N days ago" 形式で表示
- 純粋な JS 関数で生成（外部ライブラリ不要）

**タグチップ:**
- タグを `<span class="tag-chip">` で個別表示（現状はカンマ区切りテキスト）

**プログレスバー:**
- `<progress>` タグまたは `div` の width% で表示（数値テキストも右端に表示）

**編集モード時:**
- 各フィールドが `input`/`select` に切り替わる（現状と同じ）
- プログレスは `<input type="range">` に切り替わる

**注意:**
- `Status` フィールドは Properties カードから除く（ヘッダーバッジで表示済み）
- 編集モードでは Status の select も表示する（ヘッダーバッジと連動）

---

## T-4: Activity セクション再構成

**変更内容（スタイル変更中心）**

**コメント表示の変更:**

現状:
```
▲ • ▼  佐藤 美咲  2024/01/01 10:00
       ログを共有しました。
       updated: ...
```

変更後:
```
[佐]  佐藤 美咲  2h ago
      ログを共有しました。
```

- `▲▼` 投票ボタンは削除
- アバター: イニシャル1〜2文字を円形 div で表示（`background: hsl(...)` で色分け）
- タイムスタンプ: 絶対時刻 → 相対時刻（T-3 と同じ関数を使用）
- `updated:` / `deleted:` の履歴行は削除（シンプル化）

**システムイベントの区別:**
- コメント投稿者が `system` の場合 → 斜体・グレー表示
- 例: *Status changed to Todo*

**入力エリアの変更:**
- プレースホルダーを `コメントを追加...` → `Type a message...` に変更
- ボタン配置: `[close comment]` 左端、`[comment]` 右端（flex justify-content: space-between）

---

## T-5: close comment 統合機能

**変更内容（機能追加）**

**現状の挙動:**
`[close comment]` ボタン → 別の Close Reason 入力パネルを表示

**新しい挙動:**
`[close comment]` ボタン → Activity の textarea に入力されたテキストをそのまま Close 理由として使用し、タスクを Close する

```
条件: textarea が空 → エラーバナー「Close reason is required.」
条件: textarea に入力あり → detail:closeWithComment メッセージを送信
```

**新規メッセージタイプ `detail:closeWithComment`:**
```ts
{ type: 'detail:closeWithComment'; reason: string }
```

**パネル側ハンドラ（task-detail-webview-panel.ts）:**
```ts
if (m.type === 'detail:closeWithComment') {
  const current = await this.findDetailById(taskId);
  if (!current) return;
  // Close Task
  await this.updateTaskUseCase.execute({
    ...current, actorId: ACTOR_ID, expectedVersion: current.version,
    now: new Date().toISOString(),
    isClosed: true, closeReason: m.reason, isArchived: false, status: 'done'
  });
  // コメントも追加
  await this.addTaskCommentUseCase.execute({
    taskId, body: m.reason, actorId: ACTOR_ID, now: new Date().toISOString()
  });
  panel.dispose();
}
```

**Close Task ボタン（`btn-close-task`）および Close Reason パネルは削除。**

---

## 削除するもの（クリーンアップ）

| 削除対象 | 場所 |
|----------|------|
| `#close-reason-panel`（Close Task 理由入力パネル） | HTML |
| `#btn-close-task` ボタン | HTML |
| `#btn-archive` ボタン | HTML |
| `#btn-close-confirm` / `#btn-close-reason-dismiss` ボタン | HTML |
| `btn-close-task` / `btn-close-reason-dismiss` のイベントリスナー | JS |
| 右サイドバー（`.side .detail-side`）の `aside` 全体 | HTML |
| 投票ボタン（`▲▼`）のレンダリング | `renderComments()` JS 関数 |
| `updated:` / `deleted:` 履歴行 | `renderComments()` JS 関数 |

---

## 実装順序

1. **T-1** ヘッダー（構造変更が最大のため最初に）
2. **T-3** Task Properties 統合カード（サイドバー廃止と同時）
3. **T-2** Description カードのスタイル調整
4. **T-4** Activity スタイル（アバター・相対時刻・ボタン配置）
5. **T-5** close comment 統合機能（最後に、T-4 完了後）

---

## 受け入れ基準

1. ヘッダーに タイトル・ステータスバッジ・優先度バッジ・[Edit]/[×] が1行に収まる
2. Close Task ボタンがヘッダーに存在しない
3. Task Properties が Description の下に横並びカードで表示される
4. Activity のコメントにアバター（イニシャル円）と相対時刻が表示される
5. `[close comment]` ボタンが textarea の入力をそのまま Close 理由として使用し、タスクを Close できる
6. 空の textarea で `[close comment]` を押したときエラーバナーが表示される
