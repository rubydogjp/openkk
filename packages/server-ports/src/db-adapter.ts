import type {
  FiscalPeriodArchiveDbImportInput,
  ClosingDbRecord,
  EntryDbRecord,
  EntryDbUpsertInput,
  FiscalPeriodDbCreateInput,
  FiscalPeriodDbPatchInput,
  FiscalPeriodDbRecord,
  FixedAssetDbCreateInput,
  FixedAssetDbPatchInput,
  FixedAssetDbRecord,
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
} from "./types";

export interface OpenkkDbPort {
  fiscalPeriods: FiscalPeriodsDb;
  entries: EntriesDb;
  fixedAssets: FixedAssetsDb;
  closings: ClosingsDb;
  masterData: MasterDataDb;
}

export interface FiscalPeriodsDb {
  getAllByUser(userId: string): Promise<FiscalPeriodDbRecord[]>;
  getById(id: string): Promise<FiscalPeriodDbRecord | null>;
  create(
    userId: string,
    input: FiscalPeriodDbCreateInput,
  ): Promise<FiscalPeriodDbRecord>;
  importArchived(
    userId: string,
    input: FiscalPeriodArchiveDbImportInput,
  ): Promise<FiscalPeriodDbRecord>;
  update(
    id: string,
    patch: FiscalPeriodDbPatchInput,
  ): Promise<FiscalPeriodDbRecord>;
  delete(id: string): Promise<void>;
}

export interface EntriesDb {
  getAll(fiscalPeriodId: string): Promise<EntryDbRecord[]>;
  getByMonth(
    fiscalPeriodId: string,
    yearMonth: string,
  ): Promise<EntryDbRecord[]>;
  getById(id: string): Promise<EntryDbRecord | null>;
  create(
    userId: string,
    fiscalPeriodId: string,
    input: EntryDbUpsertInput,
  ): Promise<EntryDbRecord>;
  update(id: string, input: EntryDbUpsertInput): Promise<EntryDbRecord>;
  delete(id: string): Promise<void>;
  /**
   * Idempotent on `localId`: inputs whose `localId` already exists in the
   * fiscal period are skipped. Resolves to only the rows actually inserted.
   */
  importMany(
    userId: string,
    fiscalPeriodId: string,
    entries: EntryDbUpsertInput[],
  ): Promise<EntryDbRecord[]>;
}

export interface FixedAssetsDb {
  getAllByFiscalPeriod(
    fiscalPeriodId: string,
  ): Promise<FixedAssetDbRecord[]>;
  getById(id: string): Promise<FixedAssetDbRecord | null>;
  create(
    userId: string,
    fiscalPeriodId: string,
    input: FixedAssetDbCreateInput,
  ): Promise<FixedAssetDbRecord>;
  update(
    id: string,
    patch: FixedAssetDbPatchInput,
  ): Promise<FixedAssetDbRecord>;
  delete(id: string): Promise<void>;
}

export interface ClosingsDb {
  get(fiscalPeriodId: string, year: number): Promise<ClosingDbRecord | null>;
  upsert(
    fiscalPeriodId: string,
    year: number,
    isProvisional: boolean,
  ): Promise<void>;
  delete(fiscalPeriodId: string, year: number): Promise<void>;
}

export interface MasterDataDb {
  getAllBookAccounts(): Promise<MasterBookAccountDbRecord[]>;
  getAllTaxCategories(): Promise<MasterTaxCategoryDbRecord[]>;
  getAllBusinessCategories(): Promise<MasterBusinessCategoryDbRecord[]>;
}
