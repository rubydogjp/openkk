import type {
  ClosingApiRecord,
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "./types";

export interface OpenkkDbPort {
  fiscalPeriods: FiscalPeriodsDb;
  entries: EntriesDb;
  fixedAssets: FixedAssetsDb;
  closings: ClosingsDb;
  masterData: MasterDataDb;
}

export interface FiscalPeriodsDb {
  getAllByUser(userId: string): Promise<FiscalPeriodApiRecord[]>;
  getById(id: string): Promise<FiscalPeriodApiRecord | null>;
  create(
    userId: string,
    input: FiscalPeriodCreateInput,
  ): Promise<FiscalPeriodApiRecord>;
  update(
    id: string,
    patch: FiscalPeriodPatchInput,
  ): Promise<FiscalPeriodApiRecord>;
  delete(id: string): Promise<void>;
}

export interface EntriesDb {
  getAll(fiscalPeriodId: string): Promise<EntryApiRecord[]>;
  getByMonth(
    fiscalPeriodId: string,
    yearMonth: string,
  ): Promise<EntryApiRecord[]>;
  getById(id: string): Promise<EntryApiRecord | null>;
  create(
    userId: string,
    fiscalPeriodId: string,
    input: EntryUpsertInput,
  ): Promise<EntryApiRecord>;
  update(id: string, input: EntryUpsertInput): Promise<EntryApiRecord>;
  delete(id: string): Promise<void>;
  /**
   * Idempotent on `localId`: inputs whose `localId` already exists in the
   * fiscal period are skipped. Resolves to only the rows actually inserted.
   */
  importMany(
    userId: string,
    fiscalPeriodId: string,
    entries: EntryUpsertInput[],
  ): Promise<EntryApiRecord[]>;
}

export interface FixedAssetsDb {
  getAllByFiscalPeriod(
    fiscalPeriodId: string,
  ): Promise<FixedAssetApiRecord[]>;
  getById(id: string): Promise<FixedAssetApiRecord | null>;
  create(
    userId: string,
    fiscalPeriodId: string,
    input: FixedAssetCreateInput,
  ): Promise<FixedAssetApiRecord>;
  update(
    id: string,
    patch: FixedAssetPatchInput,
  ): Promise<FixedAssetApiRecord>;
  delete(id: string): Promise<void>;
}

export interface ClosingsDb {
  get(fiscalPeriodId: string, year: number): Promise<ClosingApiRecord | null>;
  upsert(
    fiscalPeriodId: string,
    year: number,
    isProvisional: boolean,
  ): Promise<void>;
  delete(fiscalPeriodId: string, year: number): Promise<void>;
}

export interface MasterDataDb {
  getAllBookAccounts(): Promise<MasterBookAccount[]>;
  getAllTaxCategories(): Promise<MasterTaxCategory[]>;
  getAllBusinessCategories(): Promise<MasterBusinessCategory[]>;
}
