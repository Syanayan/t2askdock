export interface TransactionManager {
  runInTx<T>(work: () => Promise<T>): Promise<T>;
}
