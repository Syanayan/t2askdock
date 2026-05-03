export const MIGRATION_V2_SQL = [
  `ALTER TABLE tasks ADD COLUMN progress INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS external_task_map (
    connector_id TEXT NOT NULL,
    external_id  TEXT NOT NULL,
    task_id      TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    synced_at    TEXT NOT NULL,
    PRIMARY KEY(connector_id, external_id)
  )`
] as const;
