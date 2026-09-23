import { serverConflictError } from "@rubydogjp/openkk-server-domain";

import type { FiscalPeriodDbPhase } from "@rubydogjp/openkk-server-ports";
import type { OwnedFiscalPeriodDbData } from "./table-types.js";
import { parseFiscalPeriodDbData } from "./persistence-codec.js";
import type { SqlDb } from "./sql-db.js";

export async function assertDbFiscalPeriodAllows(
  db: SqlDb,
  fiscalPeriodId: string,
  allowedPhases: FiscalPeriodDbPhase[],
  operation: string,
): Promise<OwnedFiscalPeriodDbData | null> {
  const rows = (await db.exec({
    sql: `SELECT user_id, data FROM fiscal_periods WHERE id = ?`,
    bind: [fiscalPeriodId],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string]>;
  const row = rows[0];
  if (row == null) return null;
  const period = { ...parseFiscalPeriodDbData(row[1]), userId: row[0] };
  if (
    period.archiveStatus !== "active" ||
    !allowedPhases.includes(period.phase)
  ) {
    throw serverConflictError(
      `fiscal period cannot ${operation} from phase ${period.phase} (${period.archiveStatus})`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
  return period;
}
