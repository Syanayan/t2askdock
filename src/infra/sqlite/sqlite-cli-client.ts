import { spawn } from 'node:child_process';
import type { SqlParams, SqlRunResult, SqliteClient } from './sqlite-client.js';

type QueryMode = 'execute' | 'json';

export class SqliteCliClient implements SqliteClient {
  public constructor(private readonly databasePath: string) {}

  public async run(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    const changesRows = await this.invoke<{ changes: number }>('json', `${sql}; SELECT changes() AS changes`, params);
    return { changes: changesRows[0]?.changes ?? 0 };
  }

  public async get<T>(sql: string, params: SqlParams = []): Promise<T | undefined> {
    const rows = await this.invoke<T>('json', sql, params);
    return rows[0];
  }

  public async all<T>(sql: string, params: SqlParams = []): Promise<ReadonlyArray<T>> {
    return this.invoke<T>('json', sql, params);
  }

  public async exec(sql: string): Promise<void> {
    await this.invoke('execute', sql);
  }

  private async invoke<T>(mode: QueryMode, sql: string, params: SqlParams = []): Promise<T[]> {
    const args = [this.databasePath];
    if (mode === 'json') {
      args.push('-json');
    }

    const script = `${this.buildParameterScript(params)}\n${sql.trim().endsWith(';') ? sql : `${sql};`}\n`;
    const stdout = await this.runProcess(args, script);

    if (mode === 'execute') {
      return [];
    }

    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
      return [];
    }

    return JSON.parse(trimmed) as T[];
  }

  private buildParameterScript(params: SqlParams): string {
    if (params.length === 0) {
      return '.parameter clear';
    }

    const lines = ['.parameter clear'];
    params.forEach((value, index) => {
      lines.push(`.parameter set ?${index + 1} ${this.formatParameterValue(value)}`);
    });
    return lines.join('\n');
  }

  private formatParameterValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    if (value instanceof Uint8Array) {
      return `x'${Buffer.from(value).toString('hex')}'`;
    }

    const escaped = String(value).replaceAll("'", "''");
    return `'${escaped}'`;
  }

  private async runProcess(args: string[], stdin: string): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn('sqlite3', args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += String(chunk);
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk);
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }

        reject(new Error(stderr.trim().length > 0 ? stderr.trim() : `sqlite3 exited with code ${String(code)}`));
      });

      child.stdin.end(stdin);
    });
  }
}
