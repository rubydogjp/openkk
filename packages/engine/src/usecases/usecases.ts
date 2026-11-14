import {
  assertClosingEntriesMatch,
  assertFiscalPeriodCanCarryOver,
  assertNoOverlappingActiveFiscalPeriod,
  buildExpectedClosingEntries,
  engineNotFoundError,
} from "../domain/index.js";
import type {
  EntryDbUpsertInput,
  FiscalPeriodCarryoverDbApplyInput,
  FiscalPeriodCarryoverFromArchiveDbApplyInput,
  FiscalPeriodDbCreateInput,
  FiscalPeriodNextDbCreateInput,
  FiscalPeriodDbPatchInput,
  FixedAssetDbCreateInput,
  FixedAssetDbPatchInput,
  OpenkkDbPort,
} from "../ports/index.js";
import {
  normalizeArchiveImportInput,
  type UnvalidatedFiscalPeriodArchive,
} from "./archive-import.js";
import { createLocalAuthUsecase } from "./local-auth.js";

export type EngineUsecases = ReturnType<typeof createEngineUsecases>;

export type CarryoverFromUnvalidatedArchiveInput = Omit<
  FiscalPeriodCarryoverFromArchiveDbApplyInput,
  "archive"
> & { archive: UnvalidatedFiscalPeriodArchive };

export function createEngineUsecases(db: OpenkkDbPort) {
  return {
    auth: createLocalAuthUsecase(),
    preClosings: createPreClosingsUsecase(db),
    closings: createClosingsUsecase(db),
    entries: createEntriesUsecase(db),
    fiscalPeriods: createFiscalPeriodsUsecase(db),
    fixedAssets: createFixedAssetsUsecase(db),
    masterData: createMasterDataUsecase(db),
  };
}

function createClosingsUsecase(db: OpenkkDbPort) {
  return {
    async run(
      userId: string,
      fiscalPeriodId: string,
      entries: EntryDbUpsertInput[],
    ) {
      const period = await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      const [persistedEntries, fixedAssets, bookAccounts] = await Promise.all([
        db.entries.getAll(fiscalPeriodId),
        db.fixedAssets.getAll(fiscalPeriodId),
        db.masterData.getBookAccounts(),
      ]);
      const expectedEntries = buildExpectedClosingEntries({
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        entries: persistedEntries,
        fixedAssets,
        openingJournals: period.opening.journals,
        bookAccounts,
      });
      assertClosingEntriesMatch(entries, expectedEntries);
      return db.closings.run(fiscalPeriodId, entries);
    },
  };
}

function createPreClosingsUsecase(db: OpenkkDbPort) {
  return {
    async run(userId: string, fiscalPeriodId: string) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.preClosings.run(fiscalPeriodId);
    },
    async cancel(userId: string, fiscalPeriodId: string) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.preClosings.cancel(fiscalPeriodId);
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
      input: EntryDbUpsertInput,
    ) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.entries.create(userId, fiscalPeriodId, input);
    },
    async update(userId: string, id: string, input: EntryDbUpsertInput) {
      await requireOwnedEntry(db, userId, id);
      return db.entries.update(id, input);
    },
    async remove(userId: string, id: string) {
      await requireOwnedEntry(db, userId, id);
      await db.entries.remove(id);
    },
    async importMany(
      userId: string,
      fiscalPeriodId: string,
      entries: EntryDbUpsertInput[],
    ) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.entries.importMany(userId, fiscalPeriodId, entries);
    },
  };
}

function createFiscalPeriodsUsecase(db: OpenkkDbPort) {
  return {
    async getAll(userId: string) {
      return db.fiscalPeriods.getAll(userId);
    },
    async getById(userId: string, id: string) {
      const period = await db.fiscalPeriods.getById(id);
      return period?.userId === userId ? period : null;
    },
    async create(userId: string, input: FiscalPeriodDbCreateInput) {
      return db.fiscalPeriods.create(userId, input);
    },
    async createNext(userId: string, input: FiscalPeriodNextDbCreateInput) {
      const source = await requireOwnedFiscalPeriod(
        db,
        userId,
        input.sourceFiscalPeriodId,
      );
      assertFiscalPeriodCanCarryOver(source, input.startDate);
      return db.fiscalPeriods.createNext(userId, input);
    },
    async applyCarryover(
      userId: string,
      id: string,
      input: FiscalPeriodCarryoverDbApplyInput,
    ) {
      const target = await requireOwnedFiscalPeriod(db, userId, id);
      const source = await requireOwnedFiscalPeriod(
        db,
        userId,
        input.sourceFiscalPeriodId,
      );
      assertFiscalPeriodCanCarryOver(source, target.startDate);
      return db.fiscalPeriods.applyCarryover(id, input);
    },
    async applyCarryoverFromArchive(
      userId: string,
      id: string,
      input: CarryoverFromUnvalidatedArchiveInput,
    ) {
      await requireOwnedFiscalPeriod(db, userId, id);
      return db.fiscalPeriods.applyCarryoverFromArchive(id, {
        archive: normalizeArchiveImportInput(input.archive),
        carryBalances: input.carryBalances,
        reversalEntryIndexes: input.reversalEntryIndexes,
        carryFixedAssets: input.carryFixedAssets,
      });
    },
    async importArchived(
      userId: string,
      input: UnvalidatedFiscalPeriodArchive,
    ) {
      const normalized = normalizeArchiveImportInput(input);
      assertNoOverlappingActiveFiscalPeriod(
        normalized.fiscalPeriod,
        await db.fiscalPeriods.getAll(userId),
      );
      return db.fiscalPeriods.importArchived(userId, normalized);
    },
    async patch(userId: string, id: string, patch: FiscalPeriodDbPatchInput) {
      await requireOwnedFiscalPeriod(db, userId, id);
      return db.fiscalPeriods.patch(id, patch);
    },
    async start(userId: string, id: string) {
      await requireOwnedFiscalPeriod(db, userId, id);
      return db.fiscalPeriods.start(id);
    },
    async remove(userId: string, id: string) {
      await requireOwnedFiscalPeriod(db, userId, id);
      await db.fiscalPeriods.remove(id);
    },
  };
}

function createFixedAssetsUsecase(db: OpenkkDbPort) {
  return {
    async getAll(userId: string, fiscalPeriodId: string) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.fixedAssets.getAll(fiscalPeriodId);
    },
    async getById(userId: string, id: string) {
      const asset = await db.fixedAssets.getById(id);
      return asset?.userId === userId ? asset : null;
    },
    async create(
      userId: string,
      fiscalPeriodId: string,
      input: FixedAssetDbCreateInput,
    ) {
      await requireOwnedFiscalPeriod(db, userId, fiscalPeriodId);
      return db.fixedAssets.create(userId, fiscalPeriodId, input);
    },
    async patch(userId: string, id: string, patch: FixedAssetDbPatchInput) {
      await requireOwnedFixedAsset(db, userId, id);
      return db.fixedAssets.patch(id, patch);
    },
    async remove(userId: string, id: string) {
      await requireOwnedFixedAsset(db, userId, id);
      await db.fixedAssets.remove(id);
    },
  };
}

function createMasterDataUsecase(db: OpenkkDbPort) {
  return {
    async getBookAccounts() {
      return db.masterData.getBookAccounts();
    },
    async getTaxCategories() {
      return db.masterData.getTaxCategories();
    },
    async getBusinessCategories() {
      return db.masterData.getBusinessCategories();
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
    throw engineNotFoundError(`fiscal period not found: ${fiscalPeriodId}`);
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
    throw engineNotFoundError(`entry not found: ${entryId}`);
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
    throw engineNotFoundError(`fixed asset not found: ${fixedAssetId}`);
  }
  return asset;
}
