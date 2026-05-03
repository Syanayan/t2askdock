import { describe, expect, it } from 'vitest';
import { ExternalTaskMapRepository } from '../../../../src/infra/sqlite/repositories/external-task-map-repository.js';
import { FakeSqliteClient } from './fake-client.js';

describe('ExternalTaskMapRepository', () => {
  it('upserts map record', async () => {
    const client = new FakeSqliteClient();
    const repository = new ExternalTaskMapRepository(client);

    await repository.upsert({
      connectorId: 'github',
      externalId: '123',
      taskId: 'task-1',
      syncedAt: '2026-05-03T00:00:00Z'
    });

    const call = client.executed.find((item) => item.type === 'run' && item.sql.includes('INSERT INTO external_task_map'));
    expect(call?.params).toEqual(['github', '123', 'task-1', '2026-05-03T00:00:00Z']);
  });

  it('finds record by connector and external id', async () => {
    const client = new FakeSqliteClient();
    client.getResult = {
      connectorId: 'github',
      externalId: '123',
      taskId: 'task-1',
      syncedAt: '2026-05-03T00:00:00Z'
    };
    const repository = new ExternalTaskMapRepository(client);

    const result = await repository.findByExternalId('github', '123');

    expect(result?.taskId).toBe('task-1');
  });
});
