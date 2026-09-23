import { serverNotFoundError } from "@rubydogjp/openkk-server-domain";
import type { FiscalPeriodDbRecord } from "@rubydogjp/openkk-server-ports";
import { loadOpeningByFiscalPeriod } from "./opening-store.js";
import { msToIso, parseFiscalPeriodDbData } from "./persistence-codec.js";
import { assertDbOpeningForPeriod } from "./record-validation.js";
import type { SqlDb } from "./sql-db.js";

export async function findFiscalPeriodRecord(
  db: SqlDb,
  id: string,
): Promise<FiscalPeriodDbRecord | null> {
  const rows = (await db.exec({
    sql: `SELECT user_id, data, created_at, updated_at FROM fiscal_periods WHERE id = ?`,
    bind: [id],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, number, number]>;
  const row = rows[0];
  if (row == null) return null;
  const opening = await loadOpeningByFiscalPeriod(db, id);
  const record: FiscalPeriodDbRecord = {
    ...parseFiscalPeriodDbData(row[1]),
    userId: row[0],
    createdAt: msToIso(row[2]),
    updatedAt: msToIso(row[3]),
    opening,
  };
  assertDbOpeningForPeriod(opening, record);
  return record;
}

export async function requireFiscalPeriodRecord(
  db: SqlDb,
  id: string,
): Promise<FiscalPeriodDbRecord> {
  const record = await findFiscalPeriodRecord(db, id);
  if (record == null) throw serverNotFoundError(`fiscal period not found: ${id}`);
  return record;
}
