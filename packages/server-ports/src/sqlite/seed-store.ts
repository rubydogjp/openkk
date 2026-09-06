import { serverValidationError } from "@rubydogjp/openkk-server-domain";

import type {
  EntryDbRecord,
  FiscalPeriodDbRecord,
  FixedAssetDbRecord,
} from "../persistence-types.js";
import { insertEntryLines } from "./entry-store.js";
import { defaultOpening, replaceOpening } from "./opening-store.js";
import {
  msToIso,
  serializeFiscalPeriodDbRecord,
  serializeFixedAssetDbRecord,
} from "./persistence-codec.js";
import {
  assertDbClosingYear,
  assertDbImportedClosingState,
  assertDbOpeningForPeriod,
  assertDbStoredEntryRecord,
  assertDbStoredFixedAssetRecord,
} from "./record-validation.js";
import { nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

export type DbSnapshot = {
  fiscalPeriods: Array<{ userId: string; record: FiscalPeriodDbRecord }>;
  entries: EntryDbRecord[];
  fixedAssets: FixedAssetDbRecord[];
  preClosings?: Array<{ fiscalPeriodId: string; year: number }>;
  closings: Array<{ fiscalPeriodId: string; year: number }>;
};

export async function seedStores(db: SqlDb, seed: DbSnapshot): Promise<void> {
  const now = nowMs();
  const preparedSeed = prepareAndValidateSeed(seed, now);
  await runInTransaction(db, async () => {
    await seedStoresInner(db, preparedSeed, now);
  });
}

function prepareAndValidateSeed(seed: DbSnapshot, now: number): DbSnapshot {
  if (
    !Array.isArray(seed.fiscalPeriods) ||
    !Array.isArray(seed.entries) ||
    !Array.isArray(seed.fixedAssets) ||
    (seed.preClosings !== undefined && !Array.isArray(seed.preClosings)) ||
    !Array.isArray(seed.closings)
  ) {
    throw serverValidationError("Seed collections must be arrays");
  }

  const fiscalPeriods = seed.fiscalPeriods.map((item) => {
    if (item.userId !== item.record.userId) {
      throw serverValidationError(
        `Seed fiscal period ownership is inconsistent: ${item.record.id}`,
      );
    }
    const opening =
      item.record.opening == null
        ? defaultOpening(item.userId, item.record.id, now)
        : {
            ...item.record.opening,
            createdAt: msToIso(now),
            updatedAt: msToIso(now),
          };
    const record = { ...item.record, userId: item.userId, opening };
    assertDbOpeningForPeriod(opening, record);
    serializeFiscalPeriodDbRecord(record);
    return { userId: item.userId, record };
  });

  const periodsById = new Map<string, FiscalPeriodDbRecord>();
  const activePeriodsByUser = new Map<string, FiscalPeriodDbRecord[]>();
  for (const { record } of fiscalPeriods) {
    if (periodsById.has(record.id)) {
      throw serverValidationError(
        `Seed contains duplicate fiscal period id: ${record.id}`,
      );
    }
    periodsById.set(record.id, record);
    if (record.archiveStatus !== "active") continue;
    const activePeriods = activePeriodsByUser.get(record.userId) ?? [];
    const overlap = activePeriods.find(
      (existing) =>
        record.startDate <= existing.endDate &&
        record.endDate >= existing.startDate,
    );
    if (overlap != null) {
      throw serverValidationError(
        `Seed fiscal period ${record.id} overlaps active fiscal period ${overlap.id}`,
      );
    }
    activePeriods.push(record);
    activePeriodsByUser.set(record.userId, activePeriods);
  }

  const entryIds = new Set<string>();
  const entryLocalIds = new Set<string>();
  for (const entry of seed.entries) {
    const period = requireSeedFiscalPeriod(periodsById, entry.fiscalPeriodId);
    assertDbStoredEntryRecord(entry, period);
    if (entryIds.has(entry.id)) {
      throw serverValidationError(`Seed contains duplicate entry id: ${entry.id}`);
    }
    entryIds.add(entry.id);
    if (entry.localId === "") continue;
    const scopedLocalId = `${entry.fiscalPeriodId}\u0000${entry.localId}`;
    if (entryLocalIds.has(scopedLocalId)) {
      throw serverValidationError(
        `Seed contains duplicate entry localId: ${entry.localId}`,
      );
    }
    entryLocalIds.add(scopedLocalId);
  }

  const fixedAssetIds = new Set<string>();
  for (const asset of seed.fixedAssets) {
    const period = requireSeedFiscalPeriod(periodsById, asset.fiscalPeriodId);
    assertDbStoredFixedAssetRecord(asset, period);
    serializeFixedAssetDbRecord(asset);
    if (fixedAssetIds.has(asset.id)) {
      throw serverValidationError(
        `Seed contains duplicate fixed asset id: ${asset.id}`,
      );
    }
    fixedAssetIds.add(asset.id);
  }

  const preClosingsByPeriod = groupSeedClosingRows(
    periodsById,
    seed.preClosings ?? [],
    "pre-closing",
  );
  const closingsByPeriod = groupSeedClosingRows(
    periodsById,
    seed.closings,
    "closing",
  );
  for (const period of periodsById.values()) {
    const preClosings = preClosingsByPeriod.get(period.id) ?? [];
    const closings = closingsByPeriod.get(period.id) ?? [];
    if (period.archiveDataAvailable === false) {
      const hasArchivedData =
        seed.entries.some((entry) => entry.fiscalPeriodId === period.id) ||
        seed.fixedAssets.some((asset) => asset.fiscalPeriodId === period.id) ||
        preClosings.length > 0 ||
        closings.length > 0 ||
        (period.opening?.openingBalanceLines?.length ?? 0) > 0 ||
        (period.opening?.openingJournals?.length ?? 0) > 0;
      if (hasArchivedData) {
        throw serverValidationError(
          `Seed archived fiscal period ${period.id} contains purged data`,
        );
      }
      continue;
    }
    assertDbImportedClosingState(period, preClosings, closings);
  }

  return {
    fiscalPeriods,
    entries: seed.entries,
    fixedAssets: seed.fixedAssets,
    preClosings: seed.preClosings ?? [],
    closings: seed.closings,
  };
}

function requireSeedFiscalPeriod(
  periodsById: ReadonlyMap<string, FiscalPeriodDbRecord>,
  fiscalPeriodId: string,
): FiscalPeriodDbRecord {
  const period = periodsById.get(fiscalPeriodId);
  if (period == null) {
    throw serverValidationError(
      `Seed fiscal period not found: ${String(fiscalPeriodId)}`,
    );
  }
  return period;
}

function groupSeedClosingRows(
  periodsById: ReadonlyMap<string, FiscalPeriodDbRecord>,
  rows: ReadonlyArray<{ fiscalPeriodId: string; year: number }>,
  label: string,
): Map<string, Array<{ year: number }>> {
  const grouped = new Map<string, Array<{ year: number }>>();
  for (const row of rows) {
    const period = requireSeedFiscalPeriod(periodsById, row.fiscalPeriodId);
    assertDbClosingYear(period, row.year);
    const periodRows = grouped.get(period.id) ?? [];
    if (periodRows.some((existing) => existing.year === row.year)) {
      throw serverValidationError(
        `Seed contains duplicate ${label} marker for ${period.id}`,
      );
    }
    periodRows.push({ year: row.year });
    grouped.set(period.id, periodRows);
  }
  return grouped;
}

async function seedStoresInner(
  db: SqlDb,
  seed: DbSnapshot,
  now: number,
): Promise<void> {
  for (const item of seed.fiscalPeriods) {
    const record = item.record;
    const seededOpening = record.opening!;
    const serializedRecord = serializeFiscalPeriodDbRecord(record);
    await db.exec({
      sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
      bind: [item.record.id, item.userId, serializedRecord, now, now],
    });
    await replaceOpening(db, seededOpening, now);
  }
  for (const entry of seed.entries) {
    await db.exec({
      sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        entry.id,
        entry.fiscalPeriodId,
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
  for (const asset of seed.fixedAssets) {
    await db.exec({
      sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
      bind: [
        asset.id,
        asset.fiscalPeriodId,
        serializeFixedAssetDbRecord(asset),
        now,
        now,
      ],
    });
  }
  for (const preClosing of seed.preClosings ?? []) {
    await db.exec({
      sql: `INSERT INTO pre_closings(fiscal_period_id, year) VALUES(?, ?)`,
      bind: [preClosing.fiscalPeriodId, preClosing.year],
    });
  }
  for (const closing of seed.closings) {
    await db.exec({
      sql: `INSERT INTO closings(fiscal_period_id, year) VALUES(?, ?)`,
      bind: [closing.fiscalPeriodId, closing.year],
    });
  }
}
