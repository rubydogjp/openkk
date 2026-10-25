import {
  assertEntryMatchesRules,
  serverConflictError,
  serverValidationError,
  VIRTUAL_ENTRY_LOCAL_ID_PREFIX,
} from "@rubydogjp/openkk-server-domain";

import type {
  ClosingsDb,
  EntryDbRecord,
  EntryDbUpsertInput,
  FiscalPeriodDbRecord,
  PreClosingsDb,
} from "@rubydogjp/openkk-server-ports";
import { insertEntryLines, insertImportedEntries } from "./entry-store.js";
import { transitionFiscalPeriod } from "./fiscal-period-transition.js";
import { msToIso } from "./persistence-codec.js";
import { assertDbClosingGeneratedSizeLimits } from "./record-validation.js";
import { newId, nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";

export function createPreClosingsDb(db: SqlDb): PreClosingsDb {
  return {
    async run(fiscalPeriodId) {
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "journalizing",
        "pre_closing",
        null,
      );
    },
    async cancel(fiscalPeriodId) {
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "pre_closing",
        "journalizing",
        async () => {
          await deleteClosingGeneratedEntries(db, fiscalPeriodId);
        },
      );
    },
  };
}

export function createClosingsDb(db: SqlDb): ClosingsDb {
  return {
    async run(fiscalPeriodId, entries) {
      assertDbClosingGeneratedSizeLimits(entries);
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "pre_closing",
        "post_closing",
        async (period) => {
          await replaceClosingGeneratedEntries(db, period, entries);
        },
      );
    },
  };
}

async function deleteClosingGeneratedEntries(
  db: SqlDb,
  fiscalPeriodId: string,
): Promise<void> {
  await db.exec({
    sql: `DELETE FROM entries WHERE fiscal_period_id = ? AND local_id GLOB ?`,
    bind: [fiscalPeriodId, `${VIRTUAL_ENTRY_LOCAL_ID_PREFIX}*`],
  });
}

async function replaceClosingGeneratedEntries(
  db: SqlDb,
  period: FiscalPeriodDbRecord,
  inputs: EntryDbUpsertInput[],
): Promise<void> {
  for (const input of inputs) {
    assertEntryMatchesRules(input, period, "Closing entry");
    if (
      typeof input.localId !== "string" ||
      !input.localId.startsWith(VIRTUAL_ENTRY_LOCAL_ID_PREFIX)
    ) {
      throw serverValidationError(
        "Closing entry localId must use the reserved generated prefix",
        null,
      );
    }
  }
  await deleteClosingGeneratedEntries(db, period.id);
  const now = nowMs();
  const timestamp = msToIso(now);
  const candidates: EntryDbRecord[] = inputs.map((input) => ({
    id: newId("entry"),
    userId: period.userId,
    fiscalPeriodId: period.id,
    date: input.date,
    description: input.description,
    localId: input.localId,
    businessRate: input.businessRate,
    lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const insertedIds = await insertImportedEntries(db, candidates, now);
  if (insertedIds.size !== candidates.length) {
    throw serverConflictError(
      "closing generated entries contain duplicate localIds",
      "本締め用の自動仕訳が重複したため、本締めを中止しました",
    );
  }
  for (const entry of candidates) {
    await insertEntryLines(db, entry);
  }
}
