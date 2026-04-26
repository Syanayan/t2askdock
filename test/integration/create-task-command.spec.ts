import { describe, expect, it, vi } from 'vitest';
import { AppContainer } from '../../src/core/di/container.js';
import { CreateTaskCommand } from '../../src/ui/commands/create-task-command.js';

describe('CreateTaskCommand integration', () => {
  it('runs UI command -> usecase -> infrastructure in one flow', async () => {
    const create = vi.fn().mockResolvedValue({ id: 't-100', title: 'phase0' });

    const container = new AppContainer({
      taskWriter: { create }
    });

    const command = new CreateTaskCommand(container.buildUseCases().createTaskUseCase);
    const output = await command.run({ title: 'phase0' });

    expect(create).toHaveBeenCalledOnce();
    expect(output.id).toBe('t-100');
  });
});
