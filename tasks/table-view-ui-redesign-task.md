# テーブルビュー UI リデザインタスク

> 目的: カテゴリ選択時のタスク一覧画面を Linear 風ダークデザインに合わせてリデザインする。
> **機能は完全に維持**。`buildHtml()` の HTML/CSS/JS 書き換えのみ。

## 対象ファイル
- `src/ui/webview/task-table-webview-panel.ts`（`buildHtml()` メソッドのみ）

## 完成イメージ（スクリーンショット参照）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ プロジェクト名           [  ⌕ 検索...  ]          [Add Category] [+ Add Task] │
├───────────────────────────────────────────────────────────────────────────  ┤
│ Tasks    Done    Close    Archive                                       ≡  ⊞ │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ TITLE ↕    STATUS       ASSIGNEE  PRIORITY   PROGRESS   ACTIONS        │ │
│ │─────────────────────────────────────────────────────────────────────────│ │
│ │ ▸ カテゴリ名                                          [Rename]          │ │
│ │  タスクタイトル  ⊙ TODO    [JD]  HIGH ▓   15% ▓░░░░░                  │ │
│ │  タスクタイトル  ● PROG    [MS]  MEDIUM     65% ████░                  │ │
│ │─────────────────────────────────────────────────────────────────────────│ │
│ │ Showing 5 total tasks            ● 2 Progress  ● 1 Done                │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## T-1: ヘッダーバー

**変更内容（構造変更）**

- パネルタイトル（左）: `<span id="panel-title">` を大きなフォントで表示
- 検索バー（中央）: pill 形 input、クライアントサイドでタイトル部分一致フィルター
- 右側ボタン群: Add Category / Archive / Add Task（primary スタイル）/ Unmount DB

---

## T-2: タブバー

**変更内容（スタイル変更）**

- 既存の Tasks / Done / Close / Archive タブをそのまま維持
- pill 形ボタン、active 時はアクセントカラー（青系）
- タブバー右端にビュー切り替えアイコン（見た目のみ、機能なし）

---

## T-3: テーブル構造とカラムヘッダー

**変更内容（HTML/CSS）**

- 全体を rounded border コンテナに収める
- カラム: **TITLE / STATUS / ASSIGNEE / PRIORITY / PROGRESS / ACTIONS**
- ヘッダー行: uppercase + letter-spacing + opacity 軽め
- 行: hover highlight、selected 時はアクセントカラー背景

---

## T-4: Status バッジ

**変更内容（CSS + JS `statusBadge()` 関数）**

| Status | 色系 | アイコン |
|--------|------|---------|
| TODO | 青系（border/text） | ⊙ |
| IN PROGRESS | 黄系 | ● |
| DONE | 緑系 | ✓ |
| CLOSE | オレンジ系 | ⊗ |
| BLOCKED | 赤系 | ⚠ |
| ARCHIVED | グレー | ▪ |

---

## T-5: Assignee アバター

**変更内容（JS `avatarEl()` 関数）**

- 担当者名からイニシャル最大2文字を抽出
- 名前の文字コードから hsl カラーを決定
- 28px 円形 div でアイコン表示

---

## T-6: Priority バッジ

**変更内容（CSS + JS `priorityBadge()` 関数）**

| Priority | 色 |
|----------|----|
| CRITICAL | 赤系 |
| HIGH | オレンジ系 |
| MEDIUM | 黄系 |
| LOW | 緑系 |

---

## T-7: プログレスバー

**変更内容（JS `progressBar()` 関数）**

- `N%` テキスト + 細いバー（height: 4px）
- 塗りつぶし色: 0-29%=グレー / 30-59%=アンバー / 60-99%=青 / 100%=緑

---

## T-8: カテゴリ区切り行

**変更内容（スタイルのみ）**

- 既存の折りたたみ（クリック=折りたたみ、ダブルクリック=プロジェクトを開く）維持
- Rename ボタン維持
- 背景色を微妙に変えてカテゴリ行とタスク行を区別

---

## T-9: フッター

**変更内容（新規 HTML 要素）**

- テーブル下部に `<div class="table-footer">` を追加
- 左: `Showing N total tasks`
- 右: ステータス別カラードット + 件数（例: `● 2 Progress ● 1 Done`）
- render() の度に件数を更新

---

## 削除しないもの（機能維持リスト）

| 機能 | メッセージタイプ |
|------|--------------|
| タスクを開く | `table:openTask` |
| プロジェクトを開く | `table:openProject` |
| ステータス変更 | `table:moveStatus` |
| 進捗更新 | `table:updateProgress` |
| アーカイブ | `table:archiveTasks` |
| タスク追加 | `table:addTask` |
| カテゴリ追加 | `table:addCategoryRequest` |
| カテゴリ名変更 | `table:renameCategoryRequest` |
| 準備完了 | `table:ready` |
| DB アンマウント | `table:unmountDatabase` |
| 複数選択 | Shift+click / Ctrl+click |
| サブタスク展開 | Tree expand/collapse |

---

## 実装順序

1. T-1, T-2 — ヘッダー/タブ構造（既存ボタンの id を維持）
2. T-3 — テーブルコンテナ + カラムヘッダー
3. T-4〜T-7 — バッジ・アバター・プログレスバー関数
4. T-8 — カテゴリ行スタイル
5. T-9 — フッター + 検索フィルターの JS 接続
