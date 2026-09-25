import type {
  FiscalPeriodArchiveDbImportInput,
  EntryDbRecord,
  EntryDbUpsertInput,
  FiscalPeriodDbCreateInput,
  FiscalPeriodNextDbCreateInput,
  FiscalPeriodDbPatchInput,
  FiscalPeriodDbRecord,
  FixedAssetDbCreateInput,
  FixedAssetDbPatchInput,
  FixedAssetDbRecord,
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
} from "./persistence-types.js";

export interface OpenkkDbPort {
  fiscalPeriods: FiscalPeriodsDb;
  entries: EntriesDb;
  fixedAssets: FixedAssetsDb;
  preClosings: PreClosingsDb;
  closings: ClosingsDb;
  masterData: MasterDataDb;
}

export interface FiscalPeriodsDb {
  getAll(userId: string): Promise<FiscalPeriodDbRecord[]>;
  getById(id: string): Promise<FiscalPeriodDbRecord | null>;
  create(
    userId: string,
    input: FiscalPeriodDbCreateInput,
  ): Promise<FiscalPeriodDbRecord>;
  createNext(
    userId: string,
    input: FiscalPeriodNextDbCreateInput,
  ): Promise<FiscalPeriodDbRecord>;
  importArchived(
    userId: string,
    input: FiscalPeriodArchiveDbImportInput,
  ): Promise<FiscalPeriodDbRecord>;
  patch(
    id: string,
    patch: FiscalPeriodDbPatchInput,
  ): Promise<FiscalPeriodDbRecord>;
  start(id: string): Promise<FiscalPeriodDbRecord>;
  archive(id: string): Promise<FiscalPeriodDbRecord>;
  purgeArchivedData(id: string): Promise<FiscalPeriodDbRecord>;
  remove(id: string): Promise<void>;
}

export interface EntriesDb {
  getAll(fiscalPeriodId: string): Promise<EntryDbRecord[]>;
  getById(id: string): Promise<EntryDbRecord | null>;
  create(
    userId: string,
    fiscalPeriodId: string,
    input: EntryDbUpsertInput,
  ): Promise<EntryDbRecord>;
  update(id: string, input: EntryDbUpsertInput): Promise<EntryDbRecord>;
  remove(id: string): Promise<void>;
  importMany(
    userId: string,
    fiscalPeriodId: string,
    entries: EntryDbUpsertInput[],
  ): Promise<EntryDbRecord[]>;
}

export interface FixedAssetsDb {
  getAll(fiscalPeriodId: string): Promise<FixedAssetDbRecord[]>;
  getById(id: string): Promise<FixedAssetDbRecord | null>;
  create(
    userId: string,
    fiscalPeriodId: string,
    input: FixedAssetDbCreateInput,
  ): Promise<FixedAssetDbRecord>;
  patch(
    id: string,
    patch: FixedAssetDbPatchInput,
  ): Promise<FixedAssetDbRecord>;
  remove(id: string): Promise<void>;
}

export interface ClosingsDb {
  get(fiscalPeriodId: string, year: number): Promise<boolean>;
  run(
    fiscalPeriodId: string,
    year: number,
    entries: EntryDbUpsertInput[],
  ): Promise<FiscalPeriodDbRecord>;
}

export interface PreClosingsDb {
  get(fiscalPeriodId: string, year: number): Promise<boolean>;
  run(fiscalPeriodId: string, year: number): Promise<FiscalPeriodDbRecord>;
  cancel(fiscalPeriodId: string, year: number): Promise<FiscalPeriodDbRecord>;
}

export interface MasterDataDb {
  getBookAccounts(): Promise<MasterBookAccountDbRecord[]>;
  getTaxCategories(): Promise<MasterTaxCategoryDbRecord[]>;
  getBusinessCategories(): Promise<MasterBusinessCategoryDbRecord[]>;
}
