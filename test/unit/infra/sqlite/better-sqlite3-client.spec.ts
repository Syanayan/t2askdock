import { describe, expect, it, vi } from 'vitest';
import { BetterSqlite3Client } from '../../../../src/infra/sqlite/better-sqlite3-client.js';

const mockRun = vi.fn().mockReturnValue({ changes: 1 });
const mockGet = vi.fn().mockReturnValue({ task_id: 't1', title: 'hello' });
const mockAll = vi.fn().mockReturnValue([{ title: 'hello' }]);
const mockExec = vi.fn();
const mockClose = vi.fn();
const mockPrepare = vi.fn().mockReturnValue({ run: mockRun, get: mockGet, all: mockAll });
const mockPragma = vi.fn();

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    pragma: mockPragma,
    prepare: mockPrepare,
    exec: mockExec,
    close: mockClose
  }))
}));

describe('BetterSqlite3Client', () => {
  it('exec delegates to db.exec', async () => {
    const client = new BetterSqlite3Client(':memory:');
    await client.exec('CREATE TABLE t(id TEXT)');
    expect(mockExec).toHaveBeenCalledWith('CREATE TABLE t(id TEXT)');
  });

  it('run delegates to db.prepare().run() and returns changes', async () => {
    const client = new BetterSqlite3Client(':memory:');
    const result = await client.run('INSERT INTO t VALUES (?)', ['v1']);
    expect(mockPrepare).toHaveBeenCalledWith('INSERT INTO t VALUES (?)');
    expect(mockRun).toHaveBeenCalledWith('v1');
    expect(result.changes).toBe(1);
  });

  it('get delegates to db.prepare().get()', async () => {
    const client = new BetterSqlite3Client(':memory:');
    const row = await client.get('SELECT * FROM t WHERE id = ?', ['t1']);
    expect(mockGet).toHaveBeenCalledWith('t1');
    expect(row).toEqual({ task_id: 't1', title: 'hello' });
  });

  it('all delegates to db.prepare().all()', async () => {
    const client = new BetterSqlite3Client(':memory:');
    const rows = await client.all('SELECT title FROM t', []);
    expect(mockAll).toHaveBeenCalledWith();
    expect(rows).toEqual([{ title: 'hello' }]);
  });

  it('normalizes boolean to 0/1 and Uint8Array to Buffer', async () => {
    const client = new BetterSqlite3Client(':memory:');
    await client.run('INSERT INTO misc VALUES (?, ?, ?)', [true, false, new Uint8Array([1, 2, 3])]);
    expect(mockRun).toHaveBeenCalledWith(1, 0, Buffer.from([1, 2, 3]));
  });

  it('close delegates to db.close()', () => {
    const client = new BetterSqlite3Client(':memory:');
    client.close();
    expect(mockClose).toHaveBeenCalled();
  });
});
