import {
  assertUniqueIds,
  requireObject,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

import type {
  ClosingMarkerDbImportInput,
  ClosingMarkerDbRecord,
  DbSnapshot,
  FiscalPeriodDbRecord,
} from "@rubydogjp/openkk-server-ports";
import { insertEntryLines } from "./entry-store.js";
import { replaceOpening } from "./opening-store.js";
import {
  serializeFiscalPeriodDbData,
  serializeFixedAssetDbData,
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

export async function seedStores(db: SqlDb, seed: DbSnapshot): Promise<void> {
  const now = nowMs();
  const preparedSeed = prepareAndValidateSeed(seed);
  await runInTransaction(db, async () => {
    await seedStoresInner(db, preparedSeed, now);
  });
}

function prepareAndValidateSeed(seed: unknown): DbSnapshot {
  const value = requireObject(seed, "Seed");
  if (
    !Array.isArray(value.fiscalPeriods) ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.fixedAssets) ||
    !Array.isArray(value.preClosings) ||
    !Array.isArray(value.closings)
  ) {
    throw serverValidationError("Seed collections must be arrays", null);
  }

  const fiscalPeriods: FiscalPeriodDbRecord[] = value.fiscalPeriods.map(
    (record) => {
      if (record.opening == null) {
        throw serverValidationError(
          `Seed fiscal period requires opening data: ${String(record.id)}`,
          null,
        );
      }
      assertDbOpeningForPeriod(record.opening, record);
      serializeFiscalPeriodDbData(record);
      return record;
    },
  );

  const periodsById = new Map<string, FiscalPeriodDbRecord>();
  const activePeriodsByUser = new Map<string, FiscalPeriodDbRecord[]>();
  for (const record of fiscalPeriods) {
    if (periodsById.has(record.id)) {
      throw serverValidationError(
        `Seed contains duplicate fiscal period id: ${record.id}`,
        null,
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
        null,
      );
    }
    activePeriods.push(record);
    activePeriodsByUser.set(record.userId, activePeriods);
  }

  const entryLocalIds = new Set<string>();
  for (const entry of value.entries) {
    const period = requireSeedFiscalPeriod(periodsById, entry.fiscalPeriodId);
    assertDbStoredEntryRecord(entry, period);
    assertSeedOwner(entry, period);
    if (entry.localId == null) continue;
    const scopedLocalId = `${entry.fiscalPeriodId}\u0000${entry.localId}`;
    if (entryLocalIds.has(scopedLocalId)) {
      throw serverValidationError(
        `Seed contains duplicate entry localId: ${entry.localId}`,
        null,
      );
    }
    entryLocalIds.add(scopedLocalId);
  }
  assertUniqueIds(value.entries, "Seed entry", null);

  for (const asset of value.fixedAssets) {
    const period = requireSeedFiscalPeriod(periodsById, asset.fiscalPeriodId);
    assertDbStoredFixedAssetRecord(asset, period);
    assertSeedOwner(asset, period);
    serializeFixedAssetDbData(asset);
  }
  assertUniqueIds(value.fixedAssets, "Seed fixed asset", null);

  const preClosingsByPeriod = groupSeedClosingRows(
    periodsById,
    value.preClosings,
    "pre-closing",
  );
  const closingsByPeriod = groupSeedClosingRows(
    periodsById,
    value.closings,
    "closing",
  );
  for (const period of periodsById.values()) {
    const preClosings = preClosingsByPeriod.get(period.id) ?? [];
    const closings = closingsByPeriod.get(period.id) ?? [];
    if (period.archiveStatus === "purged") {
      const hasArchivedData =
        value.entries.some((entry) => entry.fiscalPeriodId === period.id) ||
        value.fixedAssets.some((asset) => asset.fiscalPeriodId === period.id) ||
        preClosings.length > 0 ||
        closings.length > 0 ||
        period.opening.openingBalanceLines.length > 0 ||
        period.opening.openingJournals.length > 0;
      if (hasArchivedData) {
        throw serverValidationError(
          `Seed archived fiscal period ${period.id} contains purged data`,
          null,
        );
      }
      continue;
    }
    assertDbImportedClosingState(period, preClosings, closings);
  }

  return {
    fiscalPeriods,
    entries: value.entries,
    fixedAssets: value.fixedAssets,
    preClosings: value.preClosings,
    closings: value.closings,
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
      null,
    );
  }
  return period;
}

function assertSeedOwner(
  record: { id: string; userId: string },
  period: FiscalPeriodDbRecord,
): void {
  if (record.userId !== period.userId) {
    throw serverValidationError(
      `Seed record owner does not match fiscal period ${period.id}: ${record.id}`,
      null,
    );
  }
}

function groupSeedClosingRows(
  periodsById: ReadonlyMap<string, FiscalPeriodDbRecord>,
  rows: ReadonlyArray<ClosingMarkerDbRecord>,
  label: string,
): Map<string, ClosingMarkerDbImportInput[]> {
  const grouped = new Map<string, ClosingMarkerDbImportInput[]>();
  for (const row of rows) {
    const period = requireSeedFiscalPeriod(periodsById, row.fiscalPeriodId);
    assertDbClosingYear(period, row.year);
    const periodRows = grouped.get(period.id) ?? [];
    if (periodRows.some((existing) => existing.year === row.year)) {
      throw serverValidationError(
        `Seed contains duplicate ${label} marker for ${period.id}`,
        null,
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
  for (const record of seed.fiscalPeriods) {
    const serializedRecord = serializeFiscalPeriodDbData(record);
    await db.exec({
      sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
      bind: [record.id, record.userId, serializedRecord, now, now],
    });
    await replaceOpening(db, record.id, record.opening);
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
        serializeFixedAssetDbData(asset),
        now,
        now,
      ],
    });
  }
  for (const preClosing of seed.preClosings) {
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
