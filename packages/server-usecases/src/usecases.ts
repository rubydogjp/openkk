import {
  assertClosingEntriesMatch,
  buildExpectedClosingEntries,
  serverConflictError,
  serverNotFoundError,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryUpsertInput,
  FiscalPeriodArchiveImportInput,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
  OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";
import { normalizeArchiveImportInput } from "./archive-import.js";
import { createLocalAuthUsecase } from "./local-auth.js";

export type ServerUsecases = ReturnType<typeof createServerUsecases>;

export function createServerUsecases(db: OpenkkDbPort) {
  return {
    auth: createLocalAuthUsecase(),
    preClosing: createPreClosingUsecase(db),
    closing: createClosingUsecase(db),
    entries: createEntriesUsecase(db),
    fiscalPeriod: createFiscalPeriodUsecase(db),
    fixedAssets: createFixedAssetsUsecase(db),
    masterData: createMasterDataUsecase(db),
  };
}

function createClosingUsecase(db: OpenkkDbPort) {
  return {
    async get(userId: string, fiscalPeriodId: string, year: number) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.closings.get(fiscalPeriodId, year);
    },
    async run(
      userId: string,
      fiscalPeriodId: string,
      year: number,
      entries: EntryUpsertInput[],
    ) {
      const period = await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      const [persistedEntries, fixedAssets, bookAccounts] = await Promise.all([
        db.entries.getAll(fiscalPeriodId),
        db.fixedAssets.getAllByFiscalPeriod(fiscalPeriodId),
        db.masterData.getAllBookAccounts(),
      ]);
      const expectedEntries = buildExpectedClosingEntries({
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        entries: persistedEntries,
        fixedAssets,
        openingJournals: period.opening?.openingJournals ?? [],
        bookAccounts,
      });
      assertClosingEntriesMatch(entries, expectedEntries);
      return db.closings.run(fiscalPeriodId, year, entries);
    },
  };
}

function createPreClosingUsecase(db: OpenkkDbPort) {
  return {
    async get(userId: string, fiscalPeriodId: string, year: number) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.preClosings.get(fiscalPeriodId, year);
    },
    async run(userId: string, fiscalPeriodId: string, year: number) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.preClosings.run(fiscalPeriodId, year);
    },
    async cancel(userId: string, fiscalPeriodId: string, year: number) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.preClosings.cancel(fiscalPeriodId, year);
    },
  };
}

function createEntriesUsecase(db: OpenkkDbPort) {
  return {
    async getAll(userId: string, fiscalPeriodId: string) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.entries.getAll(fiscalPeriodId);
    },
    async getById(userId: string, id: string) {
      const entry = await db.entries.getById(id);
      return entry?.userId === userId ? entry : null;
    },
    async create(
      userId: string,
      fiscalPeriodId: string,
      input: EntryUpsertInput,
    ) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.entries.create(userId, fiscalPeriodId, input);
    },
    async update(userId: string, id: string, input: EntryUpsertInput) {
      await requireOwnedEntry(db, userId, id);
      return db.entries.update(id, input);
    },
    async delete(userId: string, id: string) {
      await requireOwnedEntry(db, userId, id);
      await db.entries.delete(id);
    },
    async importMany(
      userId: string,
      fiscalPeriodId: string,
      entries: EntryUpsertInput[],
    ) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.entries.importMany(userId, fiscalPeriodId, entries);
    },
  };
}

function createFiscalPeriodUsecase(db: OpenkkDbPort) {
  return {
    async getAll(userId: string) {
      return db.fiscalPeriods.getAllByUser(userId);
    },
    async create(userId: string, input: FiscalPeriodCreateInput) {
      return db.fiscalPeriods.create(userId, input);
    },
    async importArchived(
      userId: string,
      input: FiscalPeriodArchiveImportInput,
    ) {
      const normalized = normalizeArchiveImportInput(input, userId);
      const overlap = (await db.fiscalPeriods.getAllByUser(userId)).find(
        (period) =>
          period.archiveStatus === "active" &&
          normalized.fiscalPeriod.startDate <= period.endDate &&
          normalized.fiscalPeriod.endDate >= period.startDate,
      );
      if (overlap != null) {
        throw serverConflictError(
          `Archived fiscal period ${normalized.fiscalPeriod.startDate} to ${normalized.fiscalPeriod.endDate} overlaps active fiscal period ${overlap.id}`,
          "既存の会計期間と日付が重複しています",
        );
      }
      return db.fiscalPeriods.importArchived(userId, normalized);
    },
    async update(userId: string, id: string, patch: FiscalPeriodPatchInput) {
      await requireOwnedFiscalPeriod(db, userId, id);
      return db.fiscalPeriods.update(id, patch);
    },
    async archive(userId: string, id: string) {
      await requireOwnedFiscalPeriod(db, userId, id);
      return db.fiscalPeriods.archive(id);
    },
    async purgeArchivedData(userId: string, id: string) {
      await requireOwnedFiscalPeriod(db, userId, id);
      return db.fiscalPeriods.purgeArchivedData(id);
    },
    async delete(userId: string, id: string) {
      await requireOwnedFiscalPeriod(db, userId, id);
      await db.fiscalPeriods.delete(id);
    },
  };
}

function createFixedAssetsUsecase(db: OpenkkDbPort) {
  return {
    async getAll(userId: string, fiscalPeriodId: string) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.fixedAssets.getAllByFiscalPeriod(fiscalPeriodId);
    },
    async getById(userId: string, id: string) {
      const asset = await db.fixedAssets.getById(id);
      return asset?.userId === userId ? asset : null;
    },
    async create(
      userId: string,
      fiscalPeriodId: string,
      input: FixedAssetCreateInput,
    ) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.fixedAssets.create(userId, fiscalPeriodId, input);
    },
    async update(userId: string, id: string, patch: FixedAssetPatchInput) {
      await requireOwnedFixedAsset(db, userId, id);
      return db.fixedAssets.update(id, patch);
    },
    async delete(userId: string, id: string) {
      await requireOwnedFixedAsset(db, userId, id);
      await db.fixedAssets.delete(id);
    },
  };
}

function createMasterDataUsecase(db: OpenkkDbPort) {
  return {
    async getBookAccounts() {
      return db.masterData.getAllBookAccounts();
    },
    async getTaxCategories() {
      return db.masterData.getAllTaxCategories();
    },
    async getBusinessCategories() {
      return db.masterData.getAllBusinessCategories();
    },
  };
}

async function requireOwnedFiscalPeriod(
  db: OpenkkDbPort,
  userId: string,
  fiscalPeriodId: string,
) {
  const period = await db.fiscalPeriods.getById(fiscalPeriodId);
  if (period == null || period.userId !== userId) {
    throw serverNotFoundError(`fiscal period not found: ${fiscalPeriodId}`);
  }
  return period;
}

async function requireOwnedEntry(
  db: OpenkkDbPort,
  userId: string,
  entryId: string,
) {
  const entry = await db.entries.getById(entryId);
  if (entry == null || entry.userId !== userId) {
    throw serverNotFoundError(`entry not found: ${entryId}`);
  }
  return entry;
}

async function requireOwnedFixedAsset(
  db: OpenkkDbPort,
  userId: string,
  fixedAssetId: string,
) {
  const asset = await db.fixedAssets.getById(fixedAssetId);
  if (asset == null || asset.userId !== userId) {
    throw serverNotFoundError(`fixed asset not found: ${fixedAssetId}`);
  }
  return asset;
}
