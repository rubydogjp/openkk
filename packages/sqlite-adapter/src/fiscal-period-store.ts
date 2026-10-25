import {
  applyPatch,
  assertEntryMatchesRules,
  assertFiscalPeriodCanCarryOver,
  assertFixedAssetMatchesRules,
  assertNoOverlappingActiveFiscalPeriod,
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
import { createEntriesDb, insertEntry } from "./entry-store.js";
import { createFixedAssetsDb, insertFixedAsset } from "./fixed-asset-store.js";
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
} from "./persistence-codec.js";
import {
  assertDbArchiveImportSizeLimits,
  assertDbFiscalPeriodPatchAllowed,
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
          const assets = await createFixedAssetsDb(db).getAll(source.id);
          for (const asset of assets) {
            if (asset.status !== "active") continue;
            const carried: FixedAssetDbRecord = {
              ...asset,
              id: newId("fa"),
              fiscalPeriodId: record.id,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
            };
            assertFixedAssetMatchesRules(carried, record);
            await insertFixedAsset(db, carried, now);
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
      await runInTransaction(db, async () => {
        await insertFiscalPeriod(db, record, now);
        for (const inputEntry of input.entries) {
          assertEntryMatchesRules(inputEntry, record, "Archived entry");
          const entry: EntryDbRecord = {
            id: newId("entry"),
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
          await insertEntry(db, entry, now);
        }
        for (const assetInput of input.fixedAssets) {
          const asset: FixedAssetDbRecord = {
            id: newId("fa"),
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
          assertFixedAssetMatchesRules(asset, record);
          await insertFixedAsset(db, asset, now);
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
          await assertNoOverlappingStoredFiscalPeriod(db, {
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
        null,
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
  assertDbOpeningForPeriod(record.opening, record);
  await assertNoOverlappingStoredFiscalPeriod(db, {
    userId: record.userId,
    startDate: record.startDate,
    endDate: record.endDate,
    excludeFiscalPeriodId: null,
  });
  await insertFiscalPeriodRow(db, record, now);
}

export async function insertFiscalPeriodRow(
  db: SqlDb,
  record: FiscalPeriodDbRecord,
  now: number,
): Promise<void> {
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
  await replaceOpening(db, record.id, record.opening);
}

async function assertNoOverlappingStoredFiscalPeriod(
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
  assertNoOverlappingActiveFiscalPeriod(
    input,
    rows
      .map(([data]) => parseFiscalPeriodDbData(data))
      .filter((period) => period.id !== input.excludeFiscalPeriodId),
  );
}
