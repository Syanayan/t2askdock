import { describe, expect, it } from 'vitest';
import { MIGRATION_V2_SQL } from '../../../../src/infra/sqlite/migrations/initial-migration-v2.js';

describe('MIGRATION_V2_SQL', () => {
  it('contains external_task_map table creation', () => {
    expect(MIGRATION_V2_SQL.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS external_task_map'))).toBe(true);
  });
});
