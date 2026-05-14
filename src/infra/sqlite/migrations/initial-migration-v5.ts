export const MIGRATION_V5_SQL = [
  `UPDATE tasks SET status = 'review' WHERE status = 'blocked'`
] as const;
