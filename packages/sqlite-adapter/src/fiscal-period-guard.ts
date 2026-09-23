import {
  serverConflictError,
  serverNotFoundError,
} from "@rubydogjp/openkk-server-domain";

import type { FiscalPeriodDbPhase } from "@rubydogjp/openkk-server-ports";
import type { FiscalPeriodDbData } from "./table-types.js";
import { parseFiscalPeriodDbData } from "./persistence-codec.js";
import type { SqlDb } from "./sql-db.js";

export async function assertDbFiscalPeriodAllows(
  db: SqlDb,
  fiscalPeriodId: string,
  allowedPhases: FiscalPeriodDbPhase[],
  operation: string,
): Promise<FiscalPeriodDbData> {
  const [, data] = await requireFiscalPeriodRow(db, fiscalPeriodId);
  return assertPhaseAllows(
    parseFiscalPeriodDbData(data),
    allowedPhases,
    operation,
  );
}

export async function assertDbOwnedFiscalPeriodAllows(
  db: SqlDb,
  userId: string,
  fiscalPeriodId: string,
  allowedPhases: FiscalPeriodDbPhase[],
  operation: string,
): Promise<FiscalPeriodDbData> {
  const [ownerId, data] = await requireFiscalPeriodRow(db, fiscalPeriodId);
  if (ownerId !== userId) {
    throw serverNotFoundError(`fiscal period not found: ${fiscalPeriodId}`);
  }
  return assertPhaseAllows(
    parseFiscalPeriodDbData(data),
    allowedPhases,
    operation,
  );
}

async function requireFiscalPeriodRow(
  db: SqlDb,
  fiscalPeriodId: string,
): Promise<[string, string]> {
  const rows = (await db.exec({
    sql: `SELECT user_id, data FROM fiscal_periods WHERE id = ?`,
    bind: [fiscalPeriodId],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string]>;
  const row = rows[0];
  if (row == null) {
    throw serverNotFoundError(`fiscal period not found: ${fiscalPeriodId}`);
  }
  return row;
}

function assertPhaseAllows(
  period: FiscalPeriodDbData,
  allowedPhases: FiscalPeriodDbPhase[],
  operation: string,
): FiscalPeriodDbData {
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
