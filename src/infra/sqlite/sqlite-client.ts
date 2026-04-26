export type SqlParams = ReadonlyArray<unknown>;

export type SqlRunResult = {
  changes: number;
};

export interface SqliteClient {
  run(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  get<T>(sql: string, params?: SqlParams): Promise<T | undefined>;
  all<T>(sql: string, params?: SqlParams): Promise<ReadonlyArray<T>>;
  exec(sql: string): Promise<void>;
}
