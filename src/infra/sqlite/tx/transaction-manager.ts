import type { SqliteClient } from '../sqlite-client.js';

export class TransactionManager {
  public constructor(private readonly client: SqliteClient) {}

  public async runInTx<T>(work: () => Promise<T>): Promise<T> {
    await this.client.exec('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await this.client.exec('COMMIT');
      return result;
    } catch (error) {
      await this.client.exec('ROLLBACK');
      throw error;
    }
  }
}
