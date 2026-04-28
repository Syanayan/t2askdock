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
    const result = this.db.prepare(sql).run(...params);
    return { changes: result.changes };
  }

  public async get<T>(sql: string, params: SqlParams = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  public async all<T>(sql: string, params: SqlParams = []): Promise<ReadonlyArray<T>> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  public async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}
