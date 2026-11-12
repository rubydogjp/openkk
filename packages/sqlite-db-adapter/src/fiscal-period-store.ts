import {
  applyPatch,
  assertEntryMatchesRules,
  assertFiscalPeriodCanCarryOver,
  assertFixedAssetMatchesRules,
  assertNoOverlappingActiveFiscalPeriod,
  buildCarryoverOpeningBalances,
  buildCarryoverOpeningJournals,
  FISCAL_PERIOD_PATCH_KEYS,
  engineConflictError,
  engineNotFoundError,
  engineValidationError,
} from "@rubydogjp/openkk-engine";

import type {
  EntryDbRecord,
  FiscalPeriodArchiveDbImportInput,
  FiscalPeriodDbRecord,
  FiscalPeriodDbCreateInput,
  FiscalPeriodsDb,
  FixedAssetDbImportInput,
  FixedAssetDbRecord,
  OpeningBalanceLineDbRecord,
  OpeningJournalDbRecord,
} from "@rubydogjp/openkk-engine";
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
  assertDbCarryoverTargetAllowed,
  assertDbFiscalPeriodPatchAllowed,
  assertDbOpeningForPeriod,
} from "./record-validation.js";
import { newId, nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

async function requireCarryoverSource(
  periods: FiscalPeriodsDb,
  userId: string,
  sourceFiscalPeriodId: string,
): Promise<FiscalPeriodDbRecord> {
  const source = await periods.getById(sourceFiscalPeriodId);
  if (source == null || source.userId !== userId) {
    throw engineNotFoundError(
      `fiscal period not found: ${sourceFiscalPeriodId}`,
    );
  }
  return source;
}

const ARCHIVE_SOURCE_ID = "archive-source";
const ARCHIVE_SOURCE_STATUS: FiscalPeriodDbRecord["archiveStatus"] = "active";

type Carryover = {
  balanceLines: OpeningBalanceLineDbRecord[] | null;
  journals: OpeningJournalDbRecord[];
};

type CarryoverWriteOptions = {
  carryBalances: boolean;
  replaceJournals: boolean;
  carryFixedAssets: boolean;
};

function buildCarryover(
  sourceOpening: FiscalPeriodDbRecord["opening"],
  entries: ReadonlyArray<EntryDbRecord>,
  reversalEntries: ReadonlyArray<EntryDbRecord>,
  startDate: string,
  carryBalances: boolean,
): Carryover {
  return {
    balanceLines: carryBalances
      ? buildCarryoverOpeningBalances({
          openingBalanceLines: sourceOpening.balanceLines,
          entries,
        })
      : null,
    journals: buildCarryoverOpeningJournals({
      entries: reversalEntries,
      startDate,
    }),
  };
}

function selectEntriesById(
  entries: ReadonlyArray<EntryDbRecord>,
  ids: ReadonlyArray<string>,
  sourceFiscalPeriodId: string,
): EntryDbRecord[] {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  return ids.map((id) => {
    const entry = entriesById.get(id);
    if (entry == null) {
      throw engineNotFoundError(
        `Reversal entry ${id} not found in fiscal period ${sourceFiscalPeriodId}`,
      );
    }
    return entry;
  });
}

function selectEntriesByIndex(
  entries: ReadonlyArray<EntryDbRecord>,
  indexes: ReadonlyArray<number>,
): EntryDbRecord[] {
  return indexes.map((index) => {
    const entry = entries[index];
    if (entry == null) {
      throw engineValidationError(
        `Reversal entry index ${index} is outside the archive entries`,
        "再振替に選んだ仕訳が引き継ぎ元にありません",
      );
    }
    return entry;
  });
}

function archiveEntryRecords(
  archive: FiscalPeriodArchiveDbImportInput,
  userId: string,
  timestamp: string,
): EntryDbRecord[] {
  return archive.entries.map((entry, index) => ({
    id: `${ARCHIVE_SOURCE_ID}-entry-${index}`,
    userId,
    fiscalPeriodId: ARCHIVE_SOURCE_ID,
    date: entry.date,
    description: entry.description,
    localId: entry.localId,
    businessRate: entry.businessRate,
    lines: entry.lines.map((line, lineIndex) => ({
      ...line,
      id: `${ARCHIVE_SOURCE_ID}-line-${index}-${lineIndex}`,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

async function insertCarriedFixedAssets(
  db: SqlDb,
  assets: ReadonlyArray<FixedAssetDbImportInput>,
  target: FiscalPeriodDbRecord,
  now: number,
): Promise<void> {
  for (const asset of assets) {
    if (asset.status !== "active") continue;
    const carried: FixedAssetDbRecord = {
      id: newId("fa"),
      userId: target.userId,
      fiscalPeriodId: target.id,
      name: asset.name,
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCost,
      usefulLife: asset.usefulLife,
      depreciationMethod: asset.depreciationMethod,
      businessRate: asset.businessRate,
      status: asset.status,
      disposalDate: asset.disposalDate,
      disposalPrice: asset.disposalPrice,
      bookAccountId: asset.bookAccountId,
      createdAt: target.updatedAt,
      updatedAt: target.updatedAt,
    };
    assertFixedAssetMatchesRules(carried, target);
    await insertFixedAsset(db, carried, now);
  }
}

async function writeCarryover(
  db: SqlDb,
  current: FiscalPeriodDbRecord,
  carried: Carryover,
  options: CarryoverWriteOptions,
  sourceFixedAssets: () => Promise<ReadonlyArray<FixedAssetDbImportInput>>,
): Promise<FiscalPeriodDbRecord> {
  const now = nowMs();
  const updated: FiscalPeriodDbRecord = {
    ...current,
    updatedAt: msToIso(now),
    openingBalancesCompleted:
      options.carryBalances || current.openingBalancesCompleted,
    opening: {
      balanceLines: options.carryBalances
        ? (carried.balanceLines ?? [])
        : current.opening.balanceLines,
      journals: options.replaceJournals
        ? carried.journals
        : current.opening.journals,
    },
  };
  assertDbOpeningForPeriod(updated.opening, updated);
  await db.exec({
    sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
    bind: [serializeFiscalPeriodDbData(updated), now, current.id],
  });
  await replaceOpening(db, current.id, updated.opening);
  if (options.carryFixedAssets) {
    await db.exec({
      sql: `DELETE FROM fixed_assets WHERE fiscal_period_id = ?`,
      bind: [current.id],
    });
    await insertCarriedFixedAssets(db, await sourceFixedAssets(), updated, now);
  }
  return updated;
}

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
        const source = await requireCarryoverSource(
          periods,
          userId,
          input.sourceFiscalPeriodId,
        );
        assertFiscalPeriodCanCarryOver(source, input.startDate);
        const now = nowMs();
        const record = newFiscalPeriodRecord(userId, input, now);
        const entries = await createEntriesDb(db).getAll(source.id);
        const carried = buildCarryover(
          source.opening,
          entries,
          selectEntriesById(entries, input.reversalEntryIds, source.id),
          record.startDate,
          input.carryBalances,
        );
        record.opening.balanceLines = carried.balanceLines ?? [];
        record.opening.journals = carried.journals;
        record.openingBalancesCompleted = input.carryBalances;
        await insertFiscalPeriod(db, record, now);
        if (input.carryFixedAssets) {
          await insertCarriedFixedAssets(
            db,
            await createFixedAssetsDb(db).getAll(source.id),
            record,
            now,
          );
        }
        return record;
      });
    },
    async applyCarryover(id, input) {
      return runInTransaction(db, async () => {
        const current = await requireFiscalPeriodRecord(db, id);
        assertDbCarryoverTargetAllowed(current);
        const source = await requireCarryoverSource(
          periods,
          current.userId,
          input.sourceFiscalPeriodId,
        );
        assertFiscalPeriodCanCarryOver(source, current.startDate);
        const entries = await createEntriesDb(db).getAll(source.id);
        const carried = buildCarryover(
          source.opening,
          entries,
          selectEntriesById(entries, input.reversalEntryIds ?? [], source.id),
          current.startDate,
          input.carryBalances,
        );
        return writeCarryover(
          db,
          current,
          carried,
          {
            carryBalances: input.carryBalances,
            replaceJournals: input.reversalEntryIds != null,
            carryFixedAssets: input.carryFixedAssets,
          },
          () => createFixedAssetsDb(db).getAll(source.id),
        );
      });
    },
    async applyCarryoverFromArchive(id, input) {
      return runInTransaction(db, async () => {
        const current = await requireFiscalPeriodRecord(db, id);
        assertDbCarryoverTargetAllowed(current);
        const source = input.archive.fiscalPeriod;
        assertFiscalPeriodCanCarryOver(
          {
            endDate: source.endDate,
            phase: source.phase,
            documentsReceivedCompleted: source.documentsReceivedCompleted,
            archiveStatus: ARCHIVE_SOURCE_STATUS,
          },
          current.startDate,
        );
        const entries = archiveEntryRecords(
          input.archive,
          current.userId,
          current.updatedAt,
        );
        const carried = buildCarryover(
          source.opening,
          entries,
          selectEntriesByIndex(entries, input.reversalEntryIndexes ?? []),
          current.startDate,
          input.carryBalances,
        );
        return writeCarryover(
          db,
          current,
          carried,
          {
            carryBalances: input.carryBalances,
            replaceJournals: input.reversalEntryIndexes != null,
            carryFixedAssets: input.carryFixedAssets,
          },
          async () => input.archive.fixedAssets,
        );
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
          throw engineConflictError(
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
          throw engineConflictError(
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
      await runInTransaction(db, async () => {
        await db.exec({
          sql: `DELETE FROM fiscal_periods WHERE id = ?`,
          bind: [id],
        });
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
