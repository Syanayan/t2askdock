declare class Database {
  constructor(filename: string);
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  pragma(value: string): unknown;
  exec(sql: string): void;
}

declare namespace Database {
  interface Database {
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
    pragma(value: string): unknown;
    exec(sql: string): void;
  }
}

export = Database;
