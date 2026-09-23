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
import {
  assertDbClosingGeneratedSizeLimits,
  assertDbClosingYear,
} from "./record-validation.js";
import { newId, nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";

export function createPreClosingsDb(db: SqlDb): PreClosingsDb {
  return {
    async get(fiscalPeriodId, year) {
      const rows = (await db.exec({
        sql: `SELECT 1 FROM pre_closings WHERE fiscal_period_id = ? AND year = ?`,
        bind: [fiscalPeriodId, year],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[number]>;
      return rows[0] != null;
    },
    async run(fiscalPeriodId, year) {
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "journalizing",
        "pre_closing",
        async (period) => {
          assertDbClosingYear(period, year);
          await db.exec({
            sql: `INSERT OR REPLACE INTO pre_closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, year],
          });
        },
      );
    },
    async cancel(fiscalPeriodId, year) {
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "pre_closing",
        "journalizing",
        async (period) => {
          assertDbClosingYear(period, year);
          await assertDbClosingMarkerExists(
            db,
            "pre_closings",
            fiscalPeriodId,
            year,
          );
          await db.exec({
            sql: `DELETE FROM pre_closings WHERE fiscal_period_id = ? AND year = ?`,
            bind: [fiscalPeriodId, year],
          });
          await deleteClosingGeneratedEntries(db, fiscalPeriodId);
        },
      );
    },
  };
}

export function createClosingsDb(db: SqlDb): ClosingsDb {
  return {
    async get(fiscalPeriodId, year) {
      const rows = (await db.exec({
        sql: `SELECT 1 FROM closings WHERE fiscal_period_id = ? AND year = ?`,
        bind: [fiscalPeriodId, year],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[number]>;
      return rows[0] != null;
    },
    async run(fiscalPeriodId, year, entries) {
      assertDbClosingGeneratedSizeLimits(entries);
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "pre_closing",
        "post_closing",
        async (period) => {
          assertDbClosingYear(period, year);
          await assertDbClosingMarkerExists(
            db,
            "pre_closings",
            fiscalPeriodId,
            year,
          );
          await replaceClosingGeneratedEntries(db, period, entries);
          await db.exec({
            sql: `INSERT OR REPLACE INTO closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, year],
          });
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

async function assertDbClosingMarkerExists(
  db: SqlDb,
  table: "pre_closings" | "closings",
  fiscalPeriodId: string,
  year: number,
): Promise<void> {
  const rows = (await db.exec({
    sql: `SELECT 1 FROM ${table} WHERE fiscal_period_id = ? AND year = ?`,
    bind: [fiscalPeriodId, year],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[number]>;
  if (rows[0] == null) {
    throw serverConflictError(
      `${table} marker is missing for fiscal period ${fiscalPeriodId} and year ${year}`,
      "締め状態の保存データが一致しないため、処理を実行できません",
    );
  }
}
