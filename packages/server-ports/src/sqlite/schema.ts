export type SchemaMigration = {
  version: number;
  sql: string;
};

export const SQLITE_TABLE_NAMES = [
  "openkk_meta",
  "fiscal_periods",
  "openings",
  "opening_balance_lines",
  "opening_journals",
  "opening_journal_lines",
  "entries",
  "entry_lines",
  "fixed_assets",
  "pre_closings",
  "closings",
] as const;

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

const MIGRATION_V2: SchemaMigration = {
  version: 2,
  sql: `
CREATE TEMP TABLE openkk_migration_guard (
  value INTEGER NOT NULL CHECK (value = 0)
);
INSERT INTO openkk_migration_guard(value)
SELECT COUNT(*) FROM entries e
LEFT JOIN fiscal_periods fp ON fp.id = e.fiscal_period_id
WHERE fp.id IS NULL;
DELETE FROM openkk_migration_guard;
INSERT INTO openkk_migration_guard(value)
SELECT COUNT(*) FROM fixed_assets fa
LEFT JOIN fiscal_periods fp ON fp.id = fa.fiscal_period_id
WHERE fp.id IS NULL;
DELETE FROM openkk_migration_guard;
INSERT INTO openkk_migration_guard(value)
SELECT COUNT(*) FROM closings c
LEFT JOIN fiscal_periods fp ON fp.id = c.fiscal_period_id
WHERE fp.id IS NULL;
DROP TABLE openkk_migration_guard;

CREATE TEMP TABLE openkk_legacy_openings AS
SELECT
  id AS fiscal_period_id,
  CASE
    WHEN json_type(data, '$.opening') = 'object'
      THEN json_extract(data, '$.opening')
    ELSE '{}'
  END AS data,
  created_at,
  updated_at
FROM fiscal_periods;

CREATE TABLE fiscal_periods_v2 (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL CHECK (
    json_valid(data)
    AND json_type(data, '$.id') IS 'text'
    AND json_extract(data, '$.id') = id
    AND json_type(data, '$.name') IS 'text'
    AND json_type(data, '$.startDate') IS 'text'
    AND json_type(data, '$.endDate') IS 'text'
    AND json_type(data, '$.phase') IS 'text'
    AND json_extract(data, '$.phase') IN ('pre_opening', 'journalizing', 'pre_closing', 'post_closing')
    AND json_type(data, '$.archiveStatus') IS 'text'
    AND json_extract(data, '$.archiveStatus') IN ('active', 'archived')
    AND (json_type(data, '$.settingsCompleted') IS 'true' OR json_type(data, '$.settingsCompleted') IS 'false')
    AND (json_type(data, '$.openingBalancesCompleted') IS 'true' OR json_type(data, '$.openingBalancesCompleted') IS 'false')
    AND (json_type(data, '$.documentsReceivedCompleted') IS 'true' OR json_type(data, '$.documentsReceivedCompleted') IS 'false')
    AND json_type(data, '$.opening') IS NULL
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO fiscal_periods_v2(id, user_id, data, created_at, updated_at)
SELECT
  id,
  user_id,
  json_set(
    json_remove(data, '$.opening', '$.stage', '$.archived'),
    '$.phase', CASE
      WHEN EXISTS (
        SELECT 1 FROM closings c
        WHERE c.fiscal_period_id = fiscal_periods.id AND c.is_provisional = 0
      ) THEN 'post_closing'
      WHEN EXISTS (
        SELECT 1 FROM closings c
        WHERE c.fiscal_period_id = fiscal_periods.id AND c.is_provisional = 1
      ) THEN 'pre_closing'
      WHEN json_extract(data, '$.stage') = 'post_closing' THEN 'post_closing'
      WHEN json_extract(data, '$.stage') = 'journalizing' THEN 'journalizing'
      ELSE 'pre_opening'
    END,
    '$.archiveStatus', CASE
      WHEN json_extract(data, '$.archived') = 1 THEN 'archived'
      ELSE 'active'
    END
  ),
  created_at,
  updated_at
FROM fiscal_periods;
DROP TABLE fiscal_periods;
ALTER TABLE fiscal_periods_v2 RENAME TO fiscal_periods;
CREATE INDEX idx_fiscal_periods_user_created_id
  ON fiscal_periods(user_id, created_at, id);

CREATE TABLE openings (
  id               TEXT PRIMARY KEY,
  fiscal_period_id TEXT NOT NULL UNIQUE REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE opening_balance_lines (
  opening_id TEXT NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount     REAL NOT NULL CHECK (amount >= 0),
  position   INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (opening_id, id),
  UNIQUE (opening_id, account_id)
);
CREATE INDEX idx_opening_balance_lines_order
  ON opening_balance_lines(opening_id, position, id);

CREATE TABLE opening_journals (
  opening_id    TEXT NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
  id            TEXT NOT NULL,
  date          TEXT NOT NULL CHECK (date = date(date)),
  description   TEXT NOT NULL,
  business_rate REAL NOT NULL CHECK (business_rate BETWEEN 0 AND 1),
  position      INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (opening_id, id)
);
CREATE INDEX idx_opening_journals_order
  ON opening_journals(opening_id, position, id);

CREATE TABLE opening_journal_lines (
  opening_id             TEXT NOT NULL,
  opening_journal_id     TEXT NOT NULL,
  id                     TEXT NOT NULL,
  side                   TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
  book_account_id        TEXT NOT NULL,
  amount                 REAL NOT NULL CHECK (amount >= 0),
  partner_name           TEXT NOT NULL,
  tax_category_name      TEXT NOT NULL,
  business_category_name TEXT NOT NULL,
  position               INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (opening_id, opening_journal_id, id),
  FOREIGN KEY (opening_id, opening_journal_id)
    REFERENCES opening_journals(opening_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_opening_journal_lines_order
  ON opening_journal_lines(opening_id, opening_journal_id, position, id);

INSERT INTO openings(id, fiscal_period_id, created_at, updated_at)
SELECT
  COALESCE(json_extract(data, '$.id'), 'op-' || fiscal_period_id),
  fiscal_period_id,
  created_at,
  updated_at
FROM openkk_legacy_openings;

INSERT INTO opening_balance_lines(opening_id, id, account_id, amount, position)
SELECT
  o.id,
  json_extract(line.value, '$.id'),
  json_extract(line.value, '$.accountId'),
  json_extract(line.value, '$.amount'),
  CAST(line.key AS INTEGER)
FROM openkk_legacy_openings legacy
JOIN openings o ON o.fiscal_period_id = legacy.fiscal_period_id
JOIN json_each(legacy.data, '$.openingBalanceLines') line
WHERE json_type(legacy.data, '$.openingBalanceLines') = 'array';

INSERT INTO opening_journals(opening_id, id, date, description, business_rate, position)
SELECT
  o.id,
  json_extract(journal.value, '$.id'),
  json_extract(journal.value, '$.date'),
  json_extract(journal.value, '$.description'),
  json_extract(journal.value, '$.businessRate'),
  CAST(journal.key AS INTEGER)
FROM openkk_legacy_openings legacy
JOIN openings o ON o.fiscal_period_id = legacy.fiscal_period_id
JOIN json_each(legacy.data, '$.carryoverJournals') journal
WHERE json_type(legacy.data, '$.carryoverJournals') = 'array';

INSERT INTO opening_journal_lines(
  opening_id, opening_journal_id, id, side, book_account_id, amount,
  partner_name, tax_category_name, business_category_name, position
)
SELECT
  o.id,
  json_extract(journal.value, '$.id'),
  json_extract(line.value, '$.id'),
  json_extract(line.value, '$.side'),
  json_extract(line.value, '$.bookAccountId'),
  json_extract(line.value, '$.amount'),
  COALESCE(json_extract(line.value, '$.partnerName'), ''),
  COALESCE(json_extract(line.value, '$.taxCategoryName'), ''),
  COALESCE(json_extract(line.value, '$.businessCategoryName'), ''),
  CAST(line.key AS INTEGER)
FROM openkk_legacy_openings legacy
JOIN openings o ON o.fiscal_period_id = legacy.fiscal_period_id
JOIN json_each(legacy.data, '$.carryoverJournals') journal
JOIN json_each(journal.value, '$.lines') line
WHERE json_type(legacy.data, '$.carryoverJournals') = 'array';

DROP TABLE openkk_legacy_openings;

CREATE TEMP TABLE openkk_legacy_entry_lines AS
SELECT
  e.id AS entry_id,
  json_extract(line.value, '$.side') AS side,
  json_extract(line.value, '$.bookAccountId') AS book_account_id,
  json_extract(line.value, '$.amount') AS amount,
  COALESCE(json_extract(line.value, '$.partnerName'), '') AS partner_name,
  COALESCE(json_extract(line.value, '$.taxCategoryName'), '') AS tax_category_name,
  COALESCE(json_extract(line.value, '$.businessCategoryName'), '') AS business_category_name,
  CAST(line.key AS INTEGER) AS position
FROM entries e
JOIN json_each(e.data, '$.lines') line
WHERE json_type(e.data, '$.lines') = 'array';

CREATE TABLE entries_v2 (
  id               TEXT PRIMARY KEY,
  fiscal_period_id TEXT NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  date             TEXT NOT NULL CHECK (date = date(date)),
  local_id         TEXT NOT NULL,
  description      TEXT NOT NULL,
  business_rate    REAL NOT NULL CHECK (business_rate BETWEEN 0 AND 1),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
INSERT INTO entries_v2(
  id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at
)
SELECT
  id,
  fiscal_period_id,
  date,
  COALESCE(json_extract(data, '$.localId'), ''),
  json_extract(data, '$.description'),
  json_extract(data, '$.businessRate'),
  created_at,
  updated_at
FROM entries;
DROP TABLE entries;
ALTER TABLE entries_v2 RENAME TO entries;
CREATE INDEX idx_entries_fp_date_created_id
  ON entries(fiscal_period_id, date, created_at, id);
CREATE UNIQUE INDEX idx_entries_fp_local_id
  ON entries(fiscal_period_id, local_id) WHERE local_id <> '';

CREATE TABLE entry_lines (
  entry_id               TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  side                   TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
  book_account_id        TEXT NOT NULL,
  amount                 REAL NOT NULL CHECK (amount >= 0),
  partner_name           TEXT NOT NULL,
  tax_category_name      TEXT NOT NULL,
  business_category_name TEXT NOT NULL,
  position               INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (entry_id, position)
);
INSERT INTO entry_lines(
  entry_id, side, book_account_id, amount, partner_name,
  tax_category_name, business_category_name, position
)
SELECT
  entry_id, side, book_account_id, amount, partner_name,
  tax_category_name, business_category_name, position
FROM openkk_legacy_entry_lines;
DROP TABLE openkk_legacy_entry_lines;

CREATE TABLE fixed_assets_v2 (
  id               TEXT PRIMARY KEY,
  fiscal_period_id TEXT NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  data             TEXT NOT NULL CHECK (
    json_valid(data)
    AND json_type(data, '$.id') IS 'text'
    AND json_extract(data, '$.id') = id
    AND json_type(data, '$.fiscalPeriodId') IS 'text'
    AND json_extract(data, '$.fiscalPeriodId') = fiscal_period_id
    AND json_type(data, '$.name') IS 'text'
    AND json_type(data, '$.acquisitionDate') IS 'text'
    AND (json_type(data, '$.acquisitionCost') IS 'integer' OR json_type(data, '$.acquisitionCost') IS 'real')
    AND json_type(data, '$.usefulLife') IS 'integer'
    AND json_type(data, '$.depreciationMethod') IS 'text'
    AND json_extract(data, '$.depreciationMethod') = 'straight_line'
    AND (json_type(data, '$.businessRate') IS 'integer' OR json_type(data, '$.businessRate') IS 'real')
    AND json_type(data, '$.status') IS 'text'
    AND json_extract(data, '$.status') IN ('active', 'sold', 'disposed', 'retired')
    AND json_type(data, '$.disposalDate') IS 'text'
    AND (json_type(data, '$.disposalPrice') IS 'integer' OR json_type(data, '$.disposalPrice') IS 'real')
    AND json_type(data, '$.bookAccountId') IS 'text'
  ),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
INSERT INTO fixed_assets_v2 SELECT * FROM fixed_assets;
DROP TABLE fixed_assets;
ALTER TABLE fixed_assets_v2 RENAME TO fixed_assets;
CREATE INDEX idx_fixed_assets_fp_created_id
  ON fixed_assets(fiscal_period_id, created_at, id);

CREATE TABLE pre_closings (
  fiscal_period_id TEXT NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL CHECK (year BETWEEN 1 AND 9999),
  PRIMARY KEY (fiscal_period_id, year)
);
INSERT INTO pre_closings(fiscal_period_id, year)
SELECT fiscal_period_id, year FROM closings WHERE is_provisional = 1;

CREATE TABLE closings_v2 (
  fiscal_period_id TEXT NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL CHECK (year BETWEEN 1 AND 9999),
  PRIMARY KEY (fiscal_period_id, year)
);
INSERT INTO closings_v2(fiscal_period_id, year)
SELECT fiscal_period_id, year FROM closings WHERE is_provisional = 0;
DROP TABLE closings;
ALTER TABLE closings_v2 RENAME TO closings;
`.trim(),
};

export const SCHEMA_MIGRATIONS: SchemaMigration[] = [MIGRATION_V1, MIGRATION_V2];

export const SCHEMA_VERSION =
  SCHEMA_MIGRATIONS[SCHEMA_MIGRATIONS.length - 1]!.version;
