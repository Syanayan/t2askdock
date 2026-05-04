import type { ActiveClientHolder } from '../active-client-holder.js';

export class TransactionManager {
  public constructor(private readonly holder: ActiveClientHolder) {}

  public async runInTx<T>(work: () => Promise<T>): Promise<T> {
    await this.holder.get().exec('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await this.holder.get().exec('COMMIT');
      return result;
    } catch (error) {
      await this.holder.get().exec('ROLLBACK');
      throw error;
    }
  }
}
