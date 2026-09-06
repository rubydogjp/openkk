import {
  CLOSING_GENERATED_LOCAL_ID_PREFIX,
  serverConflictError,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

import type { ClosingsDb, PreClosingsDb } from "../db-adapter.js";
import type {
  ClosingDbRecord,
  EntryDbRecord,
  EntryDbUpsertInput,
  FiscalPeriodDbRecord,
  PreClosingDbRecord,
} from "../persistence-types.js";
import { insertEntryLines, insertImportedEntries } from "./entry-store.js";
import {
  loadOpeningByFiscalPeriod,
  requireOpening,
} from "./opening-store.js";
import {
  msToIso,
  parseFiscalPeriodDbRecord,
  serializeFiscalPeriodDbRecord,
} from "./persistence-codec.js";
import {
  assertDbClosingGeneratedSizeLimits,
  assertDbClosingYear,
  assertDbEntryInput,
  assertDbOpeningForPeriod,
} from "./record-validation.js";
import { newId, nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

export function createPreClosingsDb(db: SqlDb): PreClosingsDb {
  return {
    async get(fiscalPeriodId, year) {
      const rows = (await db.exec({
        sql: `SELECT 1 FROM pre_closings WHERE fiscal_period_id = ? AND year = ?`,
        bind: [fiscalPeriodId, year],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[number]>;
      return rows[0] == null ? null : ({} satisfies PreClosingDbRecord);
    },
    async run(fiscalPeriodId, year) {
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "journalizing",
        "pre_closing",
        async (_userId, period) => {
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
        async (_userId, period) => {
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
      return rows[0] == null ? null : ({} satisfies ClosingDbRecord);
    },
    async run(fiscalPeriodId, year, entries) {
      assertDbClosingGeneratedSizeLimits(entries);
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "pre_closing",
        "post_closing",
        async (userId, period) => {
          assertDbClosingYear(period, year);
          await assertDbClosingMarkerExists(
            db,
            "pre_closings",
            fiscalPeriodId,
            year,
          );
          await replaceClosingGeneratedEntries(
            db,
            userId,
            fiscalPeriodId,
            entries,
            period,
          );
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
    sql: `DELETE FROM entries WHERE fiscal_period_id = ? AND local_id LIKE ?`,
    bind: [fiscalPeriodId, `${CLOSING_GENERATED_LOCAL_ID_PREFIX}%`],
  });
}

async function replaceClosingGeneratedEntries(
  db: SqlDb,
  userId: string,
  fiscalPeriodId: string,
  inputs: EntryDbUpsertInput[],
  period: FiscalPeriodDbRecord,
): Promise<void> {
  for (const input of inputs) {
    assertDbEntryInput(input, period, "Closing entry");
    if (
      typeof input.localId !== "string" ||
      !input.localId.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX)
    ) {
      throw serverValidationError(
        "Closing entry localId must use the reserved generated prefix",
      );
    }
  }
  await deleteClosingGeneratedEntries(db, fiscalPeriodId);
  const now = nowMs();
  const timestamp = msToIso(now);
  const candidates: EntryDbRecord[] = inputs.map((input) => ({
    id: newId("entry"),
    userId,
    fiscalPeriodId,
    date: input.date,
    description: input.description,
    localId: input.localId ?? "",
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

async function transitionFiscalPeriod(
  db: SqlDb,
  fiscalPeriodId: string,
  expectedPhase: FiscalPeriodDbRecord["phase"],
  nextPhase: FiscalPeriodDbRecord["phase"],
  writeTransitionData: (
    userId: string,
    period: FiscalPeriodDbRecord,
  ) => Promise<void>,
): Promise<FiscalPeriodDbRecord> {
  let updated: FiscalPeriodDbRecord | null = null;
  await runInTransaction(db, async () => {
    const rows = (await db.exec({
      sql: `SELECT user_id, data, created_at FROM fiscal_periods WHERE id = ?`,
      bind: [fiscalPeriodId],
      returnValue: "resultRows",
      rowMode: "array",
    })) as Array<[string, string, number]>;
    const row = rows[0];
    if (row == null)
      throw serverNotFoundError(`fiscal period not found: ${fiscalPeriodId}`);
    const current = parseFiscalPeriodDbRecord(row[1]);
    if (current.archiveStatus === "archived") {
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
    updated = {
      ...current,
      userId: row[0],
      createdAt: msToIso(row[2]),
      updatedAt: msToIso(now),
      phase: nextPhase,
    };
    const opening = requireOpening(
      await loadOpeningByFiscalPeriod(db, fiscalPeriodId),
      fiscalPeriodId,
    );
    assertDbOpeningForPeriod(opening, updated);
    const serializedRecord = serializeFiscalPeriodDbRecord(updated);
    const currentWithOwnership = { ...current, userId: row[0] };
    await writeTransitionData(row[0], currentWithOwnership);
    await db.exec({
      sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
      bind: [serializedRecord, now, fiscalPeriodId],
    });
  });
  const opening = requireOpening(
    await loadOpeningByFiscalPeriod(db, fiscalPeriodId),
    fiscalPeriodId,
  );
  return { ...updated!, opening };
}
