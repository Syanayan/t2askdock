# T2askDock

T2askDock は、VS Code 内でタスクを直接管理するための拡張機能です。

## Features

- タスクの作成・編集・削除
- タスクステータスの管理
- 専用の VS Code ビューでタスクを表示
- タスクデータをローカルに保存

## Screenshots

![Task View](images/task-view.png)

## Installation

### VSIX からインストール

1. `.vsix` ファイルをダウンロードします。
2. VS Code を開きます。
3. コマンドパレットから `Extensions: Install from VSIX...` を実行します。
4. ダウンロードした `.vsix` ファイルを選択します。

## Usage

1. アクティビティバーから T2askDock ビューを開きます。
2. `Add Task` をクリックします。
3. タスクのタイトルと説明を入力します。
4. 必要に応じてタスクステータスを変更します。

## Commands

| Command | Description |
|---|---|
| `T2askDock: Open Task View` | タスク管理ビューを開きます |
| `T2askDock: Add Task` | 新しいタスクを作成します |
| `T2askDock: Refresh` | タスクリストを更新します |

## Extension Settings

この拡張機能は、現時点ではユーザー設定を提供していません。

## Requirements

- Visual Studio Code 1.xx 以降

## Known Issues

- 複数 PC 間でのタスク同期には未対応です。

## Release Notes

### 0.0.1

- 初回リリース
