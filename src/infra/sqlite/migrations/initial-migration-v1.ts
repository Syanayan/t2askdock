export const INITIAL_MIGRATION_V1_SQL = [
  `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','general')),
    status TEXT NOT NULL CHECK(status IN ('active','disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    task_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK(status IN ('todo','in_progress','done','blocked')),
    priority TEXT NOT NULL CHECK(priority IN ('low','medium','high','critical')),
    assignee TEXT,
    due_date TEXT,
    parent_task_id TEXT REFERENCES tasks(task_id),
    created_by TEXT NOT NULL REFERENCES users(user_id),
    updated_by TEXT NOT NULL REFERENCES users(user_id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 1)
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    comment_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(user_id),
    updated_by TEXT NOT NULL REFERENCES users(user_id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 1),
    deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    tag_norm TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(task_id, tag),
    UNIQUE(task_id, tag_norm)
  )`,
  `CREATE TABLE IF NOT EXISTS project_permissions (
    grant_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    user_id TEXT NOT NULL REFERENCES users(user_id),
    can_edit INTEGER NOT NULL CHECK(can_edit IN (0,1)),
    granted_by TEXT NOT NULL REFERENCES users(user_id),
    granted_at TEXT NOT NULL,
    expires_at TEXT,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS access_keys (
    key_id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL CHECK(owner_type IN ('user','device')),
    issued_for TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_salt TEXT NOT NULL,
    expires_at TEXT,
    revoked_at TEXT,
    issued_by TEXT NOT NULL REFERENCES users(user_id),
    issued_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS db_profiles (
    profile_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('readWrite','readOnly')),
    is_default INTEGER NOT NULL DEFAULT 0,
    last_connected_at TEXT,
    key_schema_version INTEGER NOT NULL DEFAULT 1,
    active_kek_version INTEGER NOT NULL DEFAULT 1,
    encrypted_dek BLOB NOT NULL,
    dek_wrap_salt TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS profile_key_wrappers (
    profile_id TEXT NOT NULL REFERENCES db_profiles(profile_id) ON DELETE CASCADE,
    key_id TEXT NOT NULL REFERENCES access_keys(key_id) ON DELETE CASCADE,
    encrypted_dek BLOB NOT NULL,
    wrap_salt TEXT NOT NULL,
    kek_version INTEGER NOT NULL,
    wrapper_status TEXT NOT NULL CHECK(wrapper_status IN ('active','revoked','rotating')),
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    PRIMARY KEY(profile_id, key_id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    log_id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    payload_diff_json TEXT NOT NULL,
    retention_class TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS feature_flags (
    flag_key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
    scope_type TEXT NOT NULL CHECK(scope_type IN ('global','profile','user')),
    scope_id TEXT,
    updated_by TEXT NOT NULL REFERENCES users(user_id),
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS connector_settings (
    connector_id TEXT NOT NULL,
    profile_id TEXT NOT NULL REFERENCES db_profiles(profile_id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
    auth_type TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    secret_ref TEXT,
    sync_policy TEXT NOT NULL CHECK(sync_policy IN ('manual','scheduled')),
    updated_by TEXT NOT NULL REFERENCES users(user_id),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(connector_id, profile_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_task_tags_norm ON task_tags(tag_norm)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_task_created ON comments(task_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC)`,
  `CREATE TRIGGER IF NOT EXISTS trg_task_tags_limit_insert
    BEFORE INSERT ON task_tags
    FOR EACH ROW
    WHEN ((SELECT COUNT(*) FROM task_tags WHERE task_id = NEW.task_id) >= 20)
    BEGIN
      SELECT RAISE(ABORT, 'E_TAG_LIMIT_EXCEEDED');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_task_tags_norm_insert
    BEFORE INSERT ON task_tags
    FOR EACH ROW
    BEGIN
      SELECT CASE
        WHEN NEW.tag_norm != LOWER(TRIM(NEW.tag))
          THEN RAISE(ABORT, 'E_TAG_NORMALIZATION_REQUIRED')
      END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_task_tags_norm_update
    BEFORE UPDATE OF tag, tag_norm ON task_tags
    FOR EACH ROW
    BEGIN
      SELECT CASE
        WHEN NEW.tag_norm != LOWER(TRIM(NEW.tag))
          THEN RAISE(ABORT, 'E_TAG_NORMALIZATION_REQUIRED')
      END;
    END`
] as const;
