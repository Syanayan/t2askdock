import { describe, expect, it } from 'vitest';
import { normalizeDraft, parseDraftJson } from '../../../../src/infra/services/ai-task-creator.js';

describe('AiTaskCreator helpers', () => {
  it('parses JSON wrapped by markdown text', () => {
    const parsed = parseDraftJson('```json\n{"title":"A"}\n```');
    expect((parsed as { title: string }).title).toBe('A');
  });

  it('normalizes invalid fields with defaults', () => {
    const draft = normalizeDraft({ title: '', priority: 'urgent', tags: ['a', 1] });
    expect(draft).toEqual({
      title: 'AI Task',
      description: null,
      priority: 'medium',
      dueDate: null,
      tags: ['a']
    });
  });
});
