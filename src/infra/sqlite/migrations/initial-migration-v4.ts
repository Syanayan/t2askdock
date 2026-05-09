export const MIGRATION_V4_SQL = [
  `ALTER TABLE tasks ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN close_reason TEXT`
] as const;
