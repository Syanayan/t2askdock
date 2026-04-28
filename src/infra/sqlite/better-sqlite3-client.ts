import Database from 'better-sqlite3';
import type { SqlParams, SqlRunResult, SqliteClient } from './sqlite-client.js';

export class BetterSqlite3Client implements SqliteClient {
  private readonly db: Database.Database;

  public constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  public async run(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    const result = this.db.prepare(sql).run(...this.normalizeParams(params));
    return { changes: result.changes };
  }

  public async get<T>(sql: string, params: SqlParams = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...this.normalizeParams(params)) as T | undefined;
  }

  public async all<T>(sql: string, params: SqlParams = []): Promise<ReadonlyArray<T>> {
    return this.db.prepare(sql).all(...this.normalizeParams(params)) as T[];
  }

  public async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  public close(): void {
    this.db.close();
  }

  private normalizeParams(params: SqlParams): unknown[] {
    return params.map(v => {
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v instanceof Uint8Array) return Buffer.from(v);
      return v;
    });
  }
}
