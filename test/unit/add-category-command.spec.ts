import { describe, it, expect, vi } from 'vitest';
import { addCategoryCommand } from '../../src/ui/commands/add-category-command.js';

describe('addCategoryCommand', () => {
  it('inserts category with trimmed name and refreshes tree', async () => {
    const showInputBox = vi.fn().mockResolvedValue('  新カテゴリ  ');
    const insertCategory = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn();

    await addCategoryCommand({ showInputBox, insertCategory, refresh });

    expect(insertCategory).toHaveBeenCalledWith('新カテゴリ');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does nothing when input is cancelled (undefined)', async () => {
    const showInputBox = vi.fn().mockResolvedValue(undefined);
    const insertCategory = vi.fn();
    const refresh = vi.fn();

    await addCategoryCommand({ showInputBox, insertCategory, refresh });

    expect(insertCategory).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does nothing when input is blank string', async () => {
    const showInputBox = vi.fn().mockResolvedValue('   ');
    const insertCategory = vi.fn();
    const refresh = vi.fn();

    await addCategoryCommand({ showInputBox, insertCategory, refresh });

    expect(insertCategory).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('calls showInputBox with correct prompt and placeHolder', async () => {
    const showInputBox = vi.fn().mockResolvedValue(undefined);
    const insertCategory = vi.fn();
    const refresh = vi.fn();

    await addCategoryCommand({ showInputBox, insertCategory, refresh });

    expect(showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.any(String),
        placeHolder: expect.any(String),
        ignoreFocusOut: true
      })
    );
  });

  it('does not refresh when insertCategory throws', async () => {
    const showInputBox = vi.fn().mockResolvedValue('テスト');
    const insertCategory = vi.fn().mockRejectedValue(new Error('DB error'));
    const refresh = vi.fn();

    await expect(addCategoryCommand({ showInputBox, insertCategory, refresh })).rejects.toThrow('DB error');
    expect(refresh).not.toHaveBeenCalled();
  });
});
