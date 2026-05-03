export const MIGRATION_V3_SQL = [
  `ALTER TABLE db_profiles ADD COLUMN mount_source TEXT NOT NULL CHECK(mount_source IN ('individual','directory')) DEFAULT 'individual'`
] as const;
