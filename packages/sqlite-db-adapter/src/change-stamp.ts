import type { SqlDb } from "./sql-db.js";

export const LAST_CHANGED_AT_META_KEY = "last_changed_at";

export const LAST_CHANGED_AT_QUERY = `SELECT value FROM openkk_meta WHERE key = '${LAST_CHANGED_AT_META_KEY}'`;

const TOTAL_CHANGES_QUERY = "SELECT total_changes()";

const STAMP_CHANGE_SQL = `
INSERT INTO openkk_meta(key, value) VALUES('${LAST_CHANGED_AT_META_KEY}', ?)
ON CONFLICT(key) DO UPDATE SET value = CAST(
  MAX(CAST(openkk_meta.value AS INTEGER) + 1, CAST(excluded.value AS INTEGER))
  AS TEXT
)`.trim();

export function parseLastChangedAt(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function totalChanges(db: SqlDb): Promise<number> {
  const rows = (await db.exec({
    sql: TOTAL_CHANGES_QUERY,
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[number]>;
  return Number(rows[0]?.[0] ?? 0);
}

export async function stampChange(db: SqlDb, now: number): Promise<void> {
  await db.exec({ sql: STAMP_CHANGE_SQL, bind: [String(now)] });
}

export async function readLastChangedAt(db: SqlDb): Promise<number | null> {
  const rows = (await db.exec({
    sql: LAST_CHANGED_AT_QUERY,
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[unknown]>;
  return parseLastChangedAt(rows[0]?.[0] ?? null);
}
