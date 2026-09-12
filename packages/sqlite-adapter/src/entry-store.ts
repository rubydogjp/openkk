import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

import type {
  EntriesDb,
  EntryDbRecord,
} from "@rubydogjp/openkk-server-ports";
import type {
  FiscalPeriodDbRow,
} from "./table-types.js";
import { assertDbFiscalPeriodAllows } from "./fiscal-period-guard.js";
import { msToIso, parseFiscalPeriodDataColumn } from "./persistence-codec.js";
import {
  assertDbEntryInput,
  assertDbPeriodOwnership,
  assertDbStoredEntryRecord,
} from "./record-validation.js";
import { newId, nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

export function createEntriesDb(db: SqlDb): EntriesDb {
  async function loadAllByFiscalPeriod(fpId: string): Promise<EntryDbRecord[]> {
    return loadEntries(
      db,
      `WHERE e.fiscal_period_id = ? ORDER BY e.date ASC, e.created_at ASC, e.id ASC, l.position ASC`,
      [fpId],
    );
  }

  return {
    async getAll(fiscalPeriodId) {
      return loadAllByFiscalPeriod(fiscalPeriodId);
    },
    async getById(id) {
      return (
        (
          await loadEntries(db, `WHERE e.id = ? ORDER BY l.position ASC`, [id])
        )[0] ?? null
      );
    },
    async create(userId, fiscalPeriodId, input) {
      const id = newId("entry");
      const now = nowMs();
      const timestamp = msToIso(now);
      const record: EntryDbRecord = {
        id,
        userId,
        fiscalPeriodId,
        date: input.date,
        description: input.description,
        localId: input.localId,
        businessRate: input.businessRate,
        lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await runInTransaction(db, async () => {
        const period = await assertDbFiscalPeriodAllows(
          db,
          fiscalPeriodId,
          ["journalizing"],
          "create entry",
        );
        assertDbPeriodOwnership(userId, period);
        assertDbEntryInput(input, period, "Entry");
        await db.exec({
          sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            id,
            fiscalPeriodId,
            record.date,
            record.localId,
            record.description,
            record.businessRate,
            now,
            now,
          ],
        });
        await insertEntryLines(db, record);
      });
      return record;
    },
    async update(id, input) {
      return runInTransaction(db, async () => {
        const existing =
          (
            await loadEntries(db, `WHERE e.id = ? ORDER BY l.position ASC`, [
              id,
            ])
          )[0] ?? null;
        if (existing == null)
          throw serverNotFoundError(`entry not found: ${id}`);
        const period = await assertDbFiscalPeriodAllows(
          db,
          existing.fiscalPeriodId,
          ["journalizing"],
          "update entry",
        );
        assertDbEntryInput(input, period, "Entry");
        const now = nowMs();
        const updated: EntryDbRecord = {
          ...existing,
          date: input.date,
          description: input.description,
          localId: input.localId,
          businessRate: input.businessRate,
          lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
          updatedAt: msToIso(now),
        };
        await db.exec({
          sql: `UPDATE entries SET date = ?, local_id = ?, description = ?, business_rate = ?, updated_at = ? WHERE id = ?`,
          bind: [
            updated.date,
            updated.localId,
            updated.description,
            updated.businessRate,
            now,
            id,
          ],
        });
        await db.exec({
          sql: `DELETE FROM entry_lines WHERE entry_id = ?`,
          bind: [id],
        });
        await insertEntryLines(db, updated);
        return updated;
      });
    },
    async delete(id) {
      await runInTransaction(db, async () => {
        const rows = (await db.exec({
          sql: `SELECT fiscal_period_id FROM entries WHERE id = ?`,
          bind: [id],
          returnValue: "resultRows",
          rowMode: "array",
        })) as Array<[string]>;
        if (rows[0] == null) return;
        await assertDbFiscalPeriodAllows(
          db,
          rows[0][0],
          ["journalizing"],
          "delete entry",
        );
        await db.exec({ sql: `DELETE FROM entries WHERE id = ?`, bind: [id] });
      });
    },
    async importMany(userId, fiscalPeriodId, inputs) {
      if (!Array.isArray(inputs)) {
        throw serverValidationError("Entry import input must be an array", null);
      }
      if (inputs.length > MAX_ENTRY_IMPORT_ITEMS) {
        throw serverValidationError(
          `Entry import exceeds the ${MAX_ENTRY_IMPORT_ITEMS} item limit`,
          null,
        );
      }
      let importLineCount = 0;
      for (const input of inputs) {
        if (input == null || !Array.isArray(input.lines)) {
          throw serverValidationError("Entry import lines must be an array", null);
        }
        importLineCount += input.lines.length;
        if (
          !Number.isSafeInteger(importLineCount) ||
          importLineCount > MAX_ENTRY_IMPORT_LINES
        ) {
          throw serverValidationError(
            `Entry import exceeds the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
            null,
          );
        }
      }
      const now = nowMs();
      const timestamp = msToIso(now);
      const candidates: EntryDbRecord[] = [];
      const seenLocalIds = new Set<string>();
      for (const input of inputs) {
        const localId = input.localId;
        if (localId != null && seenLocalIds.has(localId)) continue;
        if (localId != null) seenLocalIds.add(localId);
        candidates.push({
          id: newId("entry"),
          userId,
          fiscalPeriodId,
          date: input.date,
          description: input.description,
          localId,
          businessRate: input.businessRate,
          lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      let insertedIds = new Set<string>();
      await runInTransaction(db, async () => {
        const period = await assertDbFiscalPeriodAllows(
          db,
          fiscalPeriodId,
          ["pre_opening", "journalizing"],
          "import entries",
        );
        assertDbPeriodOwnership(userId, period);
        inputs.forEach((input) => assertDbEntryInput(input, period, "Entry"));
        insertedIds = await insertImportedEntries(db, candidates, now);
        for (const entry of candidates) {
          if (insertedIds.has(entry.id)) await insertEntryLines(db, entry);
        }
      });
      return candidates.filter((record) => insertedIds.has(record.id));
    },
  };
}

type EntryRow = [
  string,
  string,
  string,
  string,
  string,
  string | null,
  number,
  number,
  number,
  string | null,
  string | null,
  string | null,
  number | null,
  string | null,
  string | null,
  string | null,
  string,
  number,
  number,
];

async function loadEntries(
  db: SqlDb,
  whereAndOrder: string,
  bind: unknown[],
): Promise<EntryDbRecord[]> {
  const rows = (await db.exec({
    sql: `SELECT
      e.id, fp.user_id, e.fiscal_period_id, e.date, e.description, e.local_id,
      e.business_rate, e.created_at, e.updated_at,
      l.id, l.side, l.book_account_id, l.amount, l.partner_name,
      l.tax_category_id, l.business_category_id,
      fp.data, fp.created_at, fp.updated_at
    FROM entries e
    JOIN fiscal_periods fp ON fp.id = e.fiscal_period_id
    LEFT JOIN entry_lines l ON l.entry_id = e.id
    ${whereAndOrder}`,
    bind,
    returnValue: "resultRows",
    rowMode: "array",
  })) as EntryRow[];
  const records = new Map<string, EntryDbRecord>();
  const periods = new Map<string, FiscalPeriodDbRow>();
  for (const row of rows) {
    let record = records.get(row[0]);
    if (record == null) {
      record = {
        id: row[0],
        userId: row[1],
        fiscalPeriodId: row[2],
        date: row[3],
        description: row[4],
        localId: row[5],
        businessRate: row[6],
        createdAt: msToIso(row[7]),
        updatedAt: msToIso(row[8]),
        lines: [],
      };
      records.set(record.id, record);
      periods.set(record.id, {
        ...parseFiscalPeriodDataColumn(row[16]),
        userId: row[1],
        createdAt: msToIso(row[17]),
        updatedAt: msToIso(row[18]),
      });
    }
    const lineId = row[9];
    const side = row[10];
    if (side != null) {
      const bookAccountId = row[11];
      const amount = row[12];
      const partnerName = row[13];
      const taxCategoryId = row[14];
      const businessCategoryId = row[15];
      if (
        lineId == null ||
        (side !== "debit" && side !== "credit") ||
        bookAccountId == null ||
        amount == null ||
        partnerName == null ||
        taxCategoryId == null ||
        businessCategoryId == null
      ) {
        throw new Error(`invalid stored entry line: ${record.id}`);
      }
      record.lines.push({
        id: lineId,
        side,
        bookAccountId,
        amount,
        partnerName,
        taxCategoryId,
        businessCategoryId,
      });
    }
  }
  for (const record of records.values()) {
    const period = periods.get(record.id);
    if (period == null) {
      throw new Error(`fiscal period not found for stored entry: ${record.id}`);
    }
    assertDbStoredEntryRecord(record, period);
  }
  return [...records.values()];
}

export async function insertEntryLines(
  db: SqlDb,
  entry: EntryDbRecord,
): Promise<void> {
  for (const [position, line] of entry.lines.entries()) {
    await db.exec({
      sql: `INSERT INTO entry_lines(
        entry_id, id, side, book_account_id, amount, partner_name,
        tax_category_id, business_category_id, position
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        entry.id,
        line.id,
        line.side,
        line.bookAccountId,
        line.amount,
        line.partnerName,
        line.taxCategoryId,
        line.businessCategoryId,
        position,
      ],
    });
  }
}

const ENTRY_IMPORT_CHUNK_SIZE = 250;

export async function insertImportedEntries(
  db: SqlDb,
  entries: EntryDbRecord[],
  now: number,
): Promise<Set<string>> {
  const insertedIds = new Set<string>();
  for (
    let offset = 0;
    offset < entries.length;
    offset += ENTRY_IMPORT_CHUNK_SIZE
  ) {
    const chunk = entries.slice(offset, offset + ENTRY_IMPORT_CHUNK_SIZE);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const bind = chunk.flatMap((entry) => [
      entry.id,
      entry.fiscalPeriodId,
      entry.date,
      entry.localId,
      entry.description,
      entry.businessRate,
      now,
      now,
    ]);
    const rows = (await db.exec({
      sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at)
        VALUES ${placeholders}
        ON CONFLICT(fiscal_period_id, local_id) WHERE local_id IS NOT NULL DO NOTHING
        RETURNING id`,
      bind,
      returnValue: "resultRows",
      rowMode: "array",
    })) as Array<[string]>;
    rows.forEach(([id]) => insertedIds.add(id));
  }
  return insertedIds;
}
