export const MIGRATION_V5_SQL = [
  `PRAGMA foreign_keys = OFF`,
  `CREATE TABLE tasks_new (
    task_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK(status IN ('todo','in_progress','done','review')),
    priority TEXT NOT NULL CHECK(priority IN ('low','medium','high','critical')),
    assignee TEXT,
    due_date TEXT,
    parent_task_id TEXT REFERENCES tasks(task_id),
    created_by TEXT NOT NULL REFERENCES users(user_id),
    updated_by TEXT NOT NULL REFERENCES users(user_id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 1),
    progress INTEGER NOT NULL DEFAULT 0,
    is_closed INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    close_reason TEXT
  )`,
  `INSERT INTO tasks_new SELECT task_id, project_id, title, description, CASE WHEN status = 'blocked' THEN 'review' ELSE status END, priority, assignee, due_date, parent_task_id, created_by, updated_by, created_at, updated_at, version, progress, is_closed, is_archived, close_reason FROM tasks`,
  `DROP TABLE tasks`,
  `ALTER TABLE tasks_new RENAME TO tasks`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status)`,
  `PRAGMA foreign_keys = ON`
] as const;
