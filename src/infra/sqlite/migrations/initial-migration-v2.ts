export const MIGRATION_V2_SQL = [
  `ALTER TABLE tasks ADD COLUMN progress INTEGER NOT NULL DEFAULT 0`
] as const;
