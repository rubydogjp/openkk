import {
  applyPatch,
  assertEntryMatchesRules,
  assertFiscalPeriodCanCarryOver,
  assertFixedAssetMatchesRules,
  buildCarryoverOpeningBalances,
  buildCarryoverOpeningJournals,
  FISCAL_PERIOD_PATCH_KEYS,
  serverConflictError,
  serverNotFoundError,
} from "@rubydogjp/openkk-server-domain";

import type {
  EntryDbRecord,
  FiscalPeriodDbRecord,
  FiscalPeriodDbCreateInput,
  FiscalPeriodsDb,
  FixedAssetDbRecord,
} from "@rubydogjp/openkk-server-ports";
import { createEntriesDb, insertEntryLines } from "./entry-store.js";
import { createFixedAssetsDb } from "./fixed-asset-store.js";
import {
  findFiscalPeriodRecord,
  requireFiscalPeriodRecord,
} from "./fiscal-period-record.js";
import { transitionFiscalPeriod } from "./fiscal-period-transition.js";
import {
  emptyOpening,
  loadOpeningsByUser,
  replaceOpening,
} from "./opening-store.js";
import {
  msToIso,
  parseFiscalPeriodDbData,
  serializeFiscalPeriodDbData,
  serializeFixedAssetDbData,
} from "./persistence-codec.js";
import {
  assertDbArchiveImportSizeLimits,
  assertDbFiscalPeriodPatchAllowed,
  assertDbImportedClosingState,
  assertDbOpeningForPeriod,
} from "./record-validation.js";
import { newId, nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

export function createFiscalPeriodsDb(db: SqlDb): FiscalPeriodsDb {
  const periods: FiscalPeriodsDb = {
    async getAll(userId) {
      const rows = (await db.exec({
        sql: `SELECT data, created_at, updated_at FROM fiscal_periods WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
        bind: [userId],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[string, number, number]>;
      const openings = await loadOpeningsByUser(db, userId);
      return rows.map(([data, createdAt, updatedAt]) => {
        const record = parseFiscalPeriodDbData(data);
        const opening = openings.get(record.id) ?? emptyOpening();
        const result: FiscalPeriodDbRecord = {
          ...record,
          userId,
          createdAt: msToIso(createdAt),
          updatedAt: msToIso(updatedAt),
          opening,
        };
        assertDbOpeningForPeriod(opening, result);
        return result;
      });
    },
    async getById(id) {
      return findFiscalPeriodRecord(db, id);
    },
    async create(userId, input) {
      const now = nowMs();
      const record = newFiscalPeriodRecord(userId, input, now);
      await runInTransaction(db, () => insertFiscalPeriod(db, record, now));
      return record;
    },
    async createNext(userId, input) {
      return runInTransaction(db, async () => {
        const source = await periods.getById(input.sourceFiscalPeriodId);
        if (source == null || source.userId !== userId) {
          throw serverNotFoundError(
            `fiscal period not found: ${input.sourceFiscalPeriodId}`,
          );
        }
        assertFiscalPeriodCanCarryOver(source, input.startDate);
        const entries = await createEntriesDb(db).getAll(source.id);
        const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
        const selected = input.reversalEntryIds.map((id) => {
          const entry = entriesById.get(id);
          if (entry == null) {
            throw serverNotFoundError(
              `Reversal entry ${id} not found in fiscal period ${source.id}`,
            );
          }
          return entry;
        });
        const now = nowMs();
        const record = newFiscalPeriodRecord(userId, input, now);
        const opening = record.opening;
        opening.balanceLines = input.carryBalances
          ? buildCarryoverOpeningBalances({
              openingBalanceLines: source.opening.balanceLines,
              entries,
            })
          : [];
        opening.journals = buildCarryoverOpeningJournals({
          entries: selected,
          startDate: record.startDate,
        });
        record.openingBalancesCompleted = input.carryBalances;
        await insertFiscalPeriod(db, record, now);
        if (input.carryFixedAssets) {
          const assets = await createFixedAssetsDb(db).getAll(
            source.id,
          );
          for (const asset of assets) {
            if (asset.status !== "active") continue;
            await insertFixedAsset(
              db,
              {
                ...asset,
                id: newId("fa"),
                fiscalPeriodId: record.id,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
              },
              record,
              now,
            );
          }
        }
        return record;
      });
    },
    async importArchived(userId, input) {
      assertDbArchiveImportSizeLimits(input);
      const fiscalPeriodId = newId("fp");
      const now = nowMs();
      const timestamp = msToIso(now);
      const opening = input.fiscalPeriod.opening;
      const record: FiscalPeriodDbRecord = {
        id: fiscalPeriodId,
        userId,
        name: input.fiscalPeriod.name,
        startDate: input.fiscalPeriod.startDate,
        endDate: input.fiscalPeriod.endDate,
        phase: input.fiscalPeriod.phase,
        archiveStatus: "active",
        archivedAt: null,
        openingBalancesCompleted: input.fiscalPeriod.openingBalancesCompleted,
        documentsReceivedCompleted:
          input.fiscalPeriod.documentsReceivedCompleted,
        opening,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      assertDbOpeningForPeriod(opening, record);
      assertDbImportedClosingState(record, input.preClosings, input.closings);
      const serializedRecord = serializeFiscalPeriodDbData(record);
      await runInTransaction(db, async () => {
        await assertNoOverlappingActiveFiscalPeriod(db, {
          userId,
          startDate: record.startDate,
          endDate: record.endDate,
          excludeFiscalPeriodId: null,
        });
        await db.exec({
          sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
          bind: [record.id, userId, serializedRecord, now, now],
        });
        await replaceOpening(db, fiscalPeriodId, opening);
        for (const inputEntry of input.entries) {
          assertEntryMatchesRules(inputEntry, record, "Archived entry");
          const id = newId("entry");
          const entry: EntryDbRecord = {
            id,
            userId,
            fiscalPeriodId,
            date: inputEntry.date,
            description: inputEntry.description,
            localId: inputEntry.localId,
            businessRate: inputEntry.businessRate,
            lines: inputEntry.lines.map((line) => ({
              ...line,
              id: newId("eline"),
            })),
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await db.exec({
            sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
            bind: [
              id,
              fiscalPeriodId,
              entry.date,
              entry.localId,
              entry.description,
              entry.businessRate,
              now,
              now,
            ],
          });
          await insertEntryLines(db, entry);
        }
        for (const assetInput of input.fixedAssets) {
          const id = newId("fa");
          const asset: FixedAssetDbRecord = {
            id,
            userId,
            fiscalPeriodId,
            name: assetInput.name,
            acquisitionDate: assetInput.acquisitionDate,
            acquisitionCost: assetInput.acquisitionCost,
            usefulLife: assetInput.usefulLife,
            depreciationMethod: assetInput.depreciationMethod,
            businessRate: assetInput.businessRate,
            status: assetInput.status,
            disposalDate: assetInput.disposalDate,
            disposalPrice: assetInput.disposalPrice,
            bookAccountId: assetInput.bookAccountId,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await insertFixedAsset(db, asset, record, now);
        }
        for (const preClosing of input.preClosings) {
          await db.exec({
            sql: `INSERT OR REPLACE INTO pre_closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, preClosing.year],
          });
        }
        for (const closing of input.closings) {
          await db.exec({
            sql: `INSERT OR REPLACE INTO closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, closing.year],
          });
        }
      });
      return record;
    },
    async patch(id, patch) {
      return runInTransaction(db, async () => {
        const current = await requireFiscalPeriodRecord(db, id);
        assertDbFiscalPeriodPatchAllowed(current, patch);
        const now = nowMs();
        const updated = applyPatch(
          { ...current, updatedAt: msToIso(now) },
          patch,
          FISCAL_PERIOD_PATCH_KEYS,
        );
        assertDbOpeningForPeriod(updated.opening, updated);
        const serializedRecord = serializeFiscalPeriodDbData(updated);
        if (patch.startDate !== undefined || patch.endDate !== undefined) {
          await assertNoOverlappingActiveFiscalPeriod(db, {
            userId: updated.userId,
            startDate: updated.startDate,
            endDate: updated.endDate,
            excludeFiscalPeriodId: id,
          });
        }
        await db.exec({
          sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializedRecord, now, id],
        });
        if (patch.opening !== undefined) {
          await replaceOpening(db, id, updated.opening);
        }
        return updated;
      });
    },
    async start(id) {
      return transitionFiscalPeriod(
        db,
        id,
        "pre_opening",
        "journalizing",
        async () => {},
      );
    },
    async archive(id) {
      return runInTransaction(db, async () => {
        const current = await requireFiscalPeriodRecord(db, id);
        if (
          current.archiveStatus !== "active" ||
          current.phase !== "post_closing" ||
          !current.documentsReceivedCompleted
        ) {
          throw serverConflictError(
            `fiscal period cannot be archived from phase ${current.phase} (${current.archiveStatus})`,
            "本締めと書類受領が完了した会計期間のみ圧縮保存できます",
          );
        }
        const now = nowMs();
        const updated: FiscalPeriodDbRecord = {
          ...current,
          updatedAt: msToIso(now),
          archiveStatus: "archived",
          archivedAt: msToIso(now),
        };
        await db.exec({
          sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializeFiscalPeriodDbData(updated), now, id],
        });
        return updated;
      });
    },
    async purgeArchivedData(id) {
      return runInTransaction(db, async () => {
        const current = await requireFiscalPeriodRecord(db, id);
        if (current.archiveStatus === "active") {
          throw serverConflictError(
            `fiscal period must be archived before purge: ${id}`,
            "圧縮保存後の会計期間のみ実データを削除できます",
          );
        }
        const now = nowMs();
        const updated: FiscalPeriodDbRecord = {
          ...current,
          updatedAt: msToIso(now),
          archiveStatus: "purged",
          opening: emptyOpening(),
        };
        await db.exec({
          sql: `DELETE FROM entries WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        await db.exec({
          sql: `DELETE FROM fixed_assets WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        await db.exec({
          sql: `DELETE FROM pre_closings WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        await db.exec({
          sql: `DELETE FROM closings WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        await replaceOpening(db, id, updated.opening);
        await db.exec({
          sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializeFiscalPeriodDbData(updated), now, id],
        });
        return updated;
      });
    },
    async remove(id) {
      await db.exec({
        sql: `DELETE FROM fiscal_periods WHERE id = ?`,
        bind: [id],
      });
    },
  };
  return periods;
}

function newFiscalPeriodRecord(
  userId: string,
  input: FiscalPeriodDbCreateInput,
  now: number,
): FiscalPeriodDbRecord {
  const id = newId("fp");
  const timestamp = msToIso(now);
  return {
    id,
    userId,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    phase: "pre_opening",
    archiveStatus: "active",
    archivedAt: null,
    openingBalancesCompleted: false,
    documentsReceivedCompleted: false,
    opening: emptyOpening(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function insertFiscalPeriod(
  db: SqlDb,
  record: FiscalPeriodDbRecord,
  now: number,
): Promise<void> {
  const opening = record.opening;
  assertDbOpeningForPeriod(opening, record);
  await assertNoOverlappingActiveFiscalPeriod(db, {
    userId: record.userId,
    startDate: record.startDate,
    endDate: record.endDate,
    excludeFiscalPeriodId: null,
  });
  await db.exec({
    sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
    bind: [
      record.id,
      record.userId,
      serializeFiscalPeriodDbData(record),
      now,
      now,
    ],
  });
  await replaceOpening(db, record.id, opening);
}

async function insertFixedAsset(
  db: SqlDb,
  asset: FixedAssetDbRecord,
  period: FiscalPeriodDbRecord,
  now: number,
): Promise<void> {
  assertFixedAssetMatchesRules(asset, period);
  await db.exec({
    sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
    bind: [
      asset.id,
      asset.fiscalPeriodId,
      serializeFixedAssetDbData(asset),
      now,
      now,
    ],
  });
}

async function assertNoOverlappingActiveFiscalPeriod(
  db: SqlDb,
  input: {
    userId: string;
    startDate: string;
    endDate: string;
    excludeFiscalPeriodId: string | null;
  },
): Promise<void> {
  const rows = (await db.exec({
    sql: `SELECT data FROM fiscal_periods WHERE user_id = ?`,
    bind: [input.userId],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string]>;
  const overlap = rows
    .map(([data]) => parseFiscalPeriodDbData(data))
    .find(
      (period) =>
        period.id !== input.excludeFiscalPeriodId &&
        period.archiveStatus === "active" &&
        input.startDate <= period.endDate &&
        input.endDate >= period.startDate,
    );
  if (overlap != null) {
    throw serverConflictError(
      `fiscal period ${input.startDate} to ${input.endDate} overlaps active fiscal period ${overlap.id}`,
      "既存の会計期間と日付が重複しています",
    );
  }
}
