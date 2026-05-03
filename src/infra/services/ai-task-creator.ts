export type AiTaskDraft = {
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate: string | null;
  tags: string[];
};

export class AiTaskCreator {
  public async createDraft(input: { apiKey: string; model: string; prompt: string }): Promise<AiTaskDraft> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 600,
        temperature: 0,
        messages: [{ role: 'user', content: this.buildPrompt(input.prompt) }]
      })
    });
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = payload.content?.find(block => block.type === 'text' && typeof block.text === 'string');
    const json = parseDraftJson(text?.text ?? '');
    return normalizeDraft(json);
  }

  private buildPrompt(userPrompt: string): string {
    return `次の自然言語からタスク情報をJSONのみで返してください。キーは title, description, priority, dueDate, tags。priority は low|medium|high|critical。dueDate は YYYY-MM-DD か null。tags は string 配列。\n\n入力: ${userPrompt}`;
  }
}

export function parseDraftJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error('AI_RESPONSE_INVALID_JSON');
}

export function normalizeDraft(value: unknown): AiTaskDraft {
  const draft = (value ?? {}) as Record<string, unknown>;
  const priority = ['low', 'medium', 'high', 'critical'].includes(String(draft.priority)) ? String(draft.priority) as AiTaskDraft['priority'] : 'medium';
  const dueDate = typeof draft.dueDate === 'string' && draft.dueDate.trim().length > 0 ? draft.dueDate : null;
  const description = typeof draft.description === 'string' && draft.description.trim().length > 0 ? draft.description : null;
  const tags = Array.isArray(draft.tags) ? draft.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const title = typeof draft.title === 'string' && draft.title.trim().length > 0 ? draft.title.trim() : 'AI Task';

  return { title, description, priority, dueDate, tags };
}
