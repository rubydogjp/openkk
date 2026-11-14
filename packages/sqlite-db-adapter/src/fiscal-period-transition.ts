import {
  engineConflictError,
  PURGED_FISCAL_PERIOD_MESSAGE,
} from "@rubydogjp/openkk-engine";
import type {
  FiscalPeriodDbPhase,
  FiscalPeriodDbRecord,
} from "@rubydogjp/openkk-engine";
import { requireFiscalPeriodRecord } from "./fiscal-period-record.js";
import { msToIso, serializeFiscalPeriodDbData } from "./persistence-codec.js";
import { nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

export async function transitionFiscalPeriod(
  db: SqlDb,
  fiscalPeriodId: string,
  expectedPhase: FiscalPeriodDbPhase,
  nextPhase: FiscalPeriodDbPhase,
  writeTransitionData: ((period: FiscalPeriodDbRecord) => Promise<void>) | null,
): Promise<FiscalPeriodDbRecord> {
  return runInTransaction(db, async () => {
    const current = await requireFiscalPeriodRecord(db, fiscalPeriodId);
    if (current.archiveStatus !== "active") {
      throw engineConflictError(
        `purged fiscal period cannot transition: ${fiscalPeriodId}`,
        PURGED_FISCAL_PERIOD_MESSAGE,
      );
    }
    if (current.phase !== expectedPhase) {
      throw engineConflictError(
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
    await writeTransitionData?.(current);
    await db.exec({
      sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
      bind: [serializedRecord, now, fiscalPeriodId],
    });
    return updated;
  });
}
