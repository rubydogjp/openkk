import { serverConflictError } from "@rubydogjp/openkk-server-domain";

import type {
  FiscalPeriodDbPhase,
} from "@rubydogjp/openkk-server-ports";
import type {
  FiscalPeriodDbRow,
} from "./table-types.js";
import { msToIso, parseFiscalPeriodDataColumn } from "./persistence-codec.js";
import type { SqlDb } from "./sql-db.js";

export async function assertDbFiscalPeriodAllows(
  db: SqlDb,
  fiscalPeriodId: string,
  allowedPhases: FiscalPeriodDbPhase[],
  operation: string,
): Promise<FiscalPeriodDbRow | null> {
  const rows = (await db.exec({
    sql: `SELECT user_id, data, created_at, updated_at FROM fiscal_periods WHERE id = ?`,
    bind: [fiscalPeriodId],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, number, number]>;
  const row = rows[0];
  if (row == null) return null;
  const period = {
    ...parseFiscalPeriodDataColumn(row[1]),
    userId: row[0],
    createdAt: msToIso(row[2]),
    updatedAt: msToIso(row[3]),
  };
  if (
    period.archiveStatus === "archived" ||
    !allowedPhases.includes(period.phase)
  ) {
    throw serverConflictError(
      `fiscal period cannot ${operation} from phase ${period.phase} (${period.archiveStatus})`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
  return period;
}
