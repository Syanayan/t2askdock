import type { SqlParams, SqlRunResult, SqliteClient } from '../../../../src/infra/sqlite/sqlite-client.js';

export class FakeSqliteClient implements SqliteClient {
  public readonly executed: Array<{ type: 'run' | 'exec' | 'get'; sql: string; params?: SqlParams }> = [];
  public getResult: unknown = undefined;
  public allResult: ReadonlyArray<unknown> = [];
  public runResult: SqlRunResult = { changes: 1 };
  public failOnExecSql: string | null = null;

  public async run(sql: string, params?: SqlParams): Promise<SqlRunResult> {
    this.executed.push({ type: 'run', sql, params });
    return this.runResult;
  }

  public async get<T>(sql: string, params?: SqlParams): Promise<T | undefined> {
    this.executed.push({ type: 'get', sql, params });
    return this.getResult as T | undefined;
  }

  public async all<T>(sql: string, params?: SqlParams): Promise<ReadonlyArray<T>> {
    this.executed.push({ type: 'get', sql, params });
    return this.allResult as ReadonlyArray<T>;
  }

  public async exec(sql: string): Promise<void> {
    this.executed.push({ type: 'exec', sql });
    if (this.failOnExecSql !== null && sql.includes(this.failOnExecSql)) {
      throw new Error('exec failed');
    }
  }
}
