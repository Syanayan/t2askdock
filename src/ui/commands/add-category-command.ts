type ShowInputBox = (options: { prompt: string; placeHolder: string; ignoreFocusOut: boolean }) => Thenable<string | undefined>;

export type AddCategoryDeps = {
  showInputBox: ShowInputBox;
  insertCategory: (name: string) => Promise<void>;
  refresh: () => void;
};

export async function addCategoryCommand(deps: AddCategoryDeps): Promise<void> {
  const name = await deps.showInputBox({
    prompt: 'カテゴリ名を入力してください',
    placeHolder: '例: 開発, レビュー',
    ignoreFocusOut: true
  });
  if (!name?.trim()) return;
  await deps.insertCategory(name.trim());
  deps.refresh();
}
