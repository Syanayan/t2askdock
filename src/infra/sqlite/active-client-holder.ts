import type { SqliteClient } from './sqlite-client.js';

export class ActiveClientHolder {
  private current: SqliteClient;

  public constructor(initial: SqliteClient) {
    this.current = initial;
  }

  public get(): SqliteClient {
    return this.current;
  }

  public switch(next: SqliteClient): void {
    this.current = next;
  }
}
