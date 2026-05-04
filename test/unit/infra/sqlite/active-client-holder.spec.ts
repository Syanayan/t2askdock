import { describe, expect, it } from 'vitest';
import { ActiveClientHolder } from '../../../../src/infra/sqlite/active-client-holder.js';
import { TaskRepository } from '../../../../src/infra/sqlite/repositories/task-repository.js';
import { FakeSqliteClient } from './fake-client.js';

describe('ActiveClientHolder', () => {
  it('switch後にgetで新クライアントを返す', () => {
    const a = new FakeSqliteClient();
    const b = new FakeSqliteClient();
    const holder = new ActiveClientHolder(a);
    expect(holder.get()).toBe(a);
    holder.switch(b);
    expect(holder.get()).toBe(b);
  });

  it('リポジトリが切り替え後のクライアントを使う', async () => {
    const a = new FakeSqliteClient();
    const b = new FakeSqliteClient();
    const holder = new ActiveClientHolder(a);
    const repo = new TaskRepository(holder);
    await repo.listProjects();
    expect(a.executed.length).toBeGreaterThan(0);
    holder.switch(b);
    await repo.listProjects();
    expect(b.executed.length).toBeGreaterThan(0);
  });
});
