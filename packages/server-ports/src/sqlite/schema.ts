export type SchemaMigration = {
  version: number;
  sql: string;
};

const MIGRATION_V1: SchemaMigration = {
  version: 1,
  sql: `
CREATE TABLE openkk_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE fiscal_periods (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_fiscal_periods_user_id ON fiscal_periods(user_id);

CREATE TABLE entries (
  id               TEXT PRIMARY KEY,
  fiscal_period_id TEXT NOT NULL,
  date             TEXT NOT NULL,
  data             TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_entries_fiscal_period_id ON entries(fiscal_period_id);
CREATE INDEX idx_entries_fp_date ON entries(fiscal_period_id, date);

CREATE TABLE fixed_assets (
  id               TEXT PRIMARY KEY,
  fiscal_period_id TEXT NOT NULL,
  data             TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_fixed_assets_fiscal_period_id ON fixed_assets(fiscal_period_id);

CREATE TABLE closings (
  fiscal_period_id TEXT NOT NULL,
  year             INTEGER NOT NULL,
  is_provisional   INTEGER NOT NULL,
  PRIMARY KEY (fiscal_period_id, year)
);
`.trim(),
};

export const SCHEMA_MIGRATIONS: SchemaMigration[] = [MIGRATION_V1];

export const SCHEMA_VERSION =
  SCHEMA_MIGRATIONS[SCHEMA_MIGRATIONS.length - 1]!.version;
