import { serverConflictError } from "@rubydogjp/openkk-server-domain";
import type {
  FiscalPeriodDbPhase,
  FiscalPeriodDbRecord,
} from "@rubydogjp/openkk-server-ports";
import { requireFiscalPeriodRecord } from "./fiscal-period-record.js";
import {
  msToIso,
  serializeFiscalPeriodDbData,
} from "./persistence-codec.js";
import { nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

export async function transitionFiscalPeriod(
  db: SqlDb,
  fiscalPeriodId: string,
  expectedPhase: FiscalPeriodDbPhase,
  nextPhase: FiscalPeriodDbPhase,
  writeTransitionData: (period: FiscalPeriodDbRecord) => Promise<void>,
): Promise<FiscalPeriodDbRecord> {
  return runInTransaction(db, async () => {
    const current = await requireFiscalPeriodRecord(db, fiscalPeriodId);
    if (current.archiveStatus !== "active") {
      throw serverConflictError(
        `archived fiscal period cannot transition: ${fiscalPeriodId}`,
        "圧縮保存済みの会計期間は変更できません",
      );
    }
    if (current.phase !== expectedPhase) {
      throw serverConflictError(
        `invalid fiscal period transition: ${current.phase} -> ${nextPhase}`,
        "会計期間の状態が変わったため、この操作を実行できません",
      );
    }
    const now = nowMs();
    const updated: FiscalPeriodDbRecord = {
      ...current,
      updatedAt: msToIso(now),
      phase: nextPhase,
    };
    const serializedRecord = serializeFiscalPeriodDbData(updated);
    await writeTransitionData(current);
    await db.exec({
      sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
      bind: [serializedRecord, now, fiscalPeriodId],
    });
    return updated;
  });
}
