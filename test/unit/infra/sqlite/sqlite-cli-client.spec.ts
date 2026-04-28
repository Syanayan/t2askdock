import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteCliClient } from '../../../../src/infra/sqlite/sqlite-cli-client.js';

describe('SqliteCliClient', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('executes DDL and run/get/all through sqlite3 CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskdock-sqlite-'));
    tempDirs.push(dir);
    const client = new SqliteCliClient(join(dir, 'taskdock.sqlite'));

    await client.exec('CREATE TABLE tasks(task_id TEXT PRIMARY KEY, title TEXT NOT NULL, priority INTEGER NOT NULL)');
    const insert = await client.run('INSERT INTO tasks(task_id, title, priority) VALUES (?, ?, ?)', ['t1', 'hello', 1]);

    expect(insert.changes).toBe(1);

    const row = await client.get<{ task_id: string; title: string; priority: number }>(
      'SELECT task_id, title, priority FROM tasks WHERE task_id = ?',
      ['t1']
    );
    expect(row).toEqual({ task_id: 't1', title: 'hello', priority: 1 });

    const rows = await client.all<{ title: string }>('SELECT title FROM tasks WHERE priority = ?', [1]);
    expect(rows).toEqual([{ title: 'hello' }]);
  });

  it('supports null, boolean and blob parameters', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskdock-sqlite-'));
    tempDirs.push(dir);
    const client = new SqliteCliClient(join(dir, 'taskdock.sqlite'));

    await client.exec('CREATE TABLE misc(id TEXT PRIMARY KEY, nullable_text TEXT, enabled INTEGER, payload BLOB)');
    await client.run('INSERT INTO misc(id, nullable_text, enabled, payload) VALUES (?, ?, ?, ?)', [
      'm1',
      null,
      true,
      new Uint8Array([1, 2, 3])
    ]);

    const row = await client.get<{ nullable_text: string | null; enabled: number; payload: string }>(
      'SELECT nullable_text, enabled, hex(payload) AS payload FROM misc WHERE id = ?',
      ['m1']
    );

    expect(row).toEqual({ nullable_text: null, enabled: 1, payload: '010203' });
  });
});
