import { describe, expect, it } from 'vitest';
import { TransactionManager } from '../../../../src/infra/sqlite/tx/transaction-manager.js';
import { FakeSqliteClient } from './fake-client.js';

describe('TransactionManager', () => {
  it('commits when work succeeds', async () => {
    const client = new FakeSqliteClient();
    const tx = new TransactionManager(client);

    const value = await tx.runInTx(async () => 42);

    expect(value).toBe(42);
    expect(client.executed.map((x) => x.sql)).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('rolls back when work throws', async () => {
    const client = new FakeSqliteClient();
    const tx = new TransactionManager(client);

    await expect(tx.runInTx(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(client.executed.map((x) => x.sql)).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK']);
  });
});
