import { describe, expect, it, vi } from 'vitest';
import { AppContainer } from '../../src/core/di/container.js';

describe('AppContainer', () => {
  it('injects infrastructure implementation into use case', async () => {
    const create = vi.fn().mockResolvedValue({ id: 't-1', title: 'test' });
    const container = new AppContainer({
      taskWriter: {
        create
      }
    });

    const output = await container.buildUseCases().createTaskUseCase.execute({ title: 'test' });

    expect(create).toHaveBeenCalledWith({ title: 'test' });
    expect(output).toEqual({ id: 't-1', title: 'test' });
  });
});
