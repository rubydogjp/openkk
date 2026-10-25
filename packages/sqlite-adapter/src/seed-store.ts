import {
  assertUniqueIds,
  findOverlappingActiveFiscalPeriod,
  requireObject,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

import type {
  DbSnapshot,
  FiscalPeriodDbRecord,
} from "@rubydogjp/openkk-server-ports";
import { insertEntry } from "./entry-store.js";
import { insertFiscalPeriodRow } from "./fiscal-period-store.js";
import { insertFixedAsset } from "./fixed-asset-store.js";
import {
  serializeFiscalPeriodDbData,
  serializeFixedAssetDbData,
} from "./persistence-codec.js";
import {
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
    await insertSeedRecords(db, preparedSeed, now);
  });
}

function prepareAndValidateSeed(seed: unknown): DbSnapshot {
  const value = requireObject(seed, "Seed");
  if (
    !Array.isArray(value.fiscalPeriods) ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.fixedAssets)
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
    const overlap = findOverlappingActiveFiscalPeriod(record, activePeriods);
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

  for (const period of periodsById.values()) {
    if (period.archiveStatus !== "purged") continue;
    const hasArchivedData =
      value.entries.some((entry) => entry.fiscalPeriodId === period.id) ||
      value.fixedAssets.some((asset) => asset.fiscalPeriodId === period.id) ||
      period.opening.balanceLines.length > 0 ||
      period.opening.journals.length > 0;
    if (hasArchivedData) {
      throw serverValidationError(
        `Seed archived fiscal period ${period.id} contains purged data`,
        null,
      );
    }
  }

  return {
    fiscalPeriods,
    entries: value.entries,
    fixedAssets: value.fixedAssets,
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

async function insertSeedRecords(
  db: SqlDb,
  seed: DbSnapshot,
  now: number,
): Promise<void> {
  for (const record of seed.fiscalPeriods) {
    await insertFiscalPeriodRow(db, record, now);
  }
  for (const entry of seed.entries) {
    await insertEntry(db, entry, now);
  }
  for (const asset of seed.fixedAssets) {
    await insertFixedAsset(db, asset, now);
  }
}
