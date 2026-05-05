import { describe, expect, it, vi } from 'vitest';
import { MultiDbReadManager } from '../../src/infra/sqlite/multi-db-read-manager.js';

vi.mock('../../src/infra/sqlite/better-sqlite3-client.js', () => ({
  BetterSqlite3Client: vi.fn().mockImplementation((path: string) => ({ path, close: vi.fn(), all: vi.fn(), get: vi.fn(), run: vi.fn(), exec: vi.fn() }))
}));

describe('MultiDbReadManager', () => {
  it('creates connections for available profiles and marks unavailable profiles', async () => {
    const profileRepository = {
      findAll: vi.fn().mockResolvedValue([
        { profileId: 'p1', name: 'DB1', path: '/tmp/a.sqlite3' },
        { profileId: 'p2', name: 'DB2', path: '/tmp/b.sqlite3' }
      ])
    };
    const checker = { check: vi.fn().mockResolvedValueOnce({ exists: true, readable: true }).mockResolvedValueOnce({ exists: false, readable: false }) };
    const manager = new MultiDbReadManager(profileRepository as never, checker as never);

    await manager.refresh();

    expect(manager.getRepo('p1')).toBeDefined();
    expect(manager.getRepo('p2')).toBeUndefined();
    expect(manager.getProfiles()).toEqual([
      { profileId: 'p1', name: 'DB1', path: '/tmp/a.sqlite3', available: true },
      { profileId: 'p2', name: 'DB2', path: '/tmp/b.sqlite3', available: false }
    ]);
  });
});
