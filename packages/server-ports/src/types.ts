export type StartAuthSessionResponse = { authUrl: string };
export type CompleteAuthSessionResponse = { completionCode: string };
export type CreateTokenResponse = { userId: string };

export type ClosingApiRecord = {
  isProvisional: boolean;
};

export type EntryApiSide = "debit" | "credit";

export type EntryApiLine = {
  side: EntryApiSide;
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryName: string;
  businessCategoryName: string;
};

export type EntryApiRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  localId: string;
  businessRate: number;
  lines: EntryApiLine[];
};

export type EntryUpsertInput = {
  date: string;
  description: string;
  localId?: string;
  businessRate: number;
  lines: EntryApiLine[];
};

export type FiscalPeriodApiRecord = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  stage: "pre_opening" | "journalizing" | "post_closing";
  archived: boolean;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening?: {
    id: string;
    userId: string;
    fiscalPeriodId: string;
    openingBalanceLines?: Array<{
      id: string;
      accountId: string;
      amount: number;
    }>;
    carryoverJournals?: Array<{
      id: string;
      date: string;
      description: string;
      businessRate: number;
      lines: Array<{
        id: string;
        side: "debit" | "credit";
        bookAccountId: string;
        amount: number;
        partnerName: string;
        taxCategoryName: string;
        businessCategoryName: string;
      }>;
    }>;
  } | null;
};

export type FiscalPeriodCreateInput = {
  name: string;
  startDate: string;
  endDate: string;
};

export type FiscalPeriodPatchInput = Partial<{
  name: string;
  startDate: string;
  endDate: string;
  stage: "pre_opening" | "journalizing" | "post_closing";
  archived: boolean;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening: {
    id: string;
    userId: string;
    fiscalPeriodId: string;
    openingBalanceLines: Array<{
      id: string;
      accountId: string;
      amount: number;
    }>;
    carryoverJournals: Array<{
      id: string;
      date: string;
      description: string;
      businessRate: number;
      lines: Array<{
        id: string;
        side: "debit" | "credit";
        bookAccountId: string;
        amount: number;
        partnerName: string;
        taxCategoryName: string;
        businessCategoryName: string;
      }>;
    }>;
  };
}>;

export type FiscalPeriodArchiveImportInput = {
  manifest: Record<string, unknown>;
  fiscalPeriod: Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  fixedAssets: Array<Record<string, unknown>>;
  closings: Array<Record<string, unknown>>;
};

export type FiscalPeriodArchiveDbImportInput = {
  fiscalPeriod: {
    name: string;
    startDate: string;
    endDate: string;
    stage: "pre_opening" | "journalizing" | "post_closing";
    archived: true;
    settingsCompleted: boolean;
    openingBalancesCompleted: boolean;
    documentsReceivedCompleted: boolean;
    opening?: FiscalPeriodPatchInput["opening"];
  };
  entries: EntryUpsertInput[];
  fixedAssets: Array<{
    createInput: FixedAssetCreateInput;
    patchInput?: FixedAssetPatchInput;
  }>;
  closings: Array<{ year: number; isProvisional: boolean }>;
};

export type FixedAssetApiRecord = {
  id: string;
  fiscalPeriodId: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: "active" | "sold" | "disposed" | "retired";
  disposalDate: string;
  disposalPrice: number;
  bookAccountId: string;
};

export type FixedAssetCreateInput = {
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  bookAccountId: string;
};

export type FixedAssetPatchInput = {
  name?: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
  usefulLife?: number;
  depreciationMethod?: "straight_line";
  businessRate?: number;
  status?: "active" | "sold" | "disposed" | "retired";
  disposalDate?: string;
  disposalPrice?: number;
  bookAccountId?: string;
};

export type MasterBookAccount = {
  id: string;
  name: string;
  accountType:
    | "asset"
    | "liability"
    | "equity"
    | "revenue"
    | "cost_of_sales"
    | "expense";
};

export type MasterTaxCategory = {
  id: string;
  name: string;
};

export type MasterBusinessCategory = {
  id: string;
  name: string;
};

export interface AuthApi {
  startSession(redirectUrl: string): Promise<StartAuthSessionResponse>;
  completeSession(input: {
    state: string;
    code: string;
  }): Promise<CompleteAuthSessionResponse>;
  redeemCompletionCode(completionCode: string): Promise<CreateTokenResponse>;
  signOut(): Promise<void>;
}

export interface ClosingApi {
  get(fiscalPeriodId: string, year: number): Promise<ClosingApiRecord | null>;
  run(input: {
    fiscalPeriodId: string;
    year: number;
    isProvisional: boolean;
  }): Promise<void>;
  cancel(fiscalPeriodId: string, year: number): Promise<void>;
}

export interface EntriesApi {
  getAll(fiscalPeriodId: string): Promise<EntryApiRecord[]>;
  create(
    fiscalPeriodId: string,
    input: EntryUpsertInput,
  ): Promise<EntryApiRecord>;
  patch(
    fiscalPeriodId: string,
    id: string,
    input: EntryUpsertInput,
  ): Promise<EntryApiRecord>;
  remove(fiscalPeriodId: string, id: string): Promise<void>;
  importMany(
    fiscalPeriodId: string,
    entries: EntryUpsertInput[],
  ): Promise<{ importedCount: number; entries: EntryApiRecord[] }>;
}

export interface FiscalPeriodApi {
  getAll(): Promise<FiscalPeriodApiRecord[]>;
  create(input: FiscalPeriodCreateInput): Promise<FiscalPeriodApiRecord>;
  importArchived(
    input: FiscalPeriodArchiveImportInput,
  ): Promise<FiscalPeriodApiRecord>;
  patch(
    id: string,
    input: FiscalPeriodPatchInput,
  ): Promise<FiscalPeriodApiRecord>;
  remove(id: string): Promise<void>;
}

export interface FixedAssetsApi {
  getAll(fiscalPeriodId: string): Promise<FixedAssetApiRecord[]>;
  create(
    fiscalPeriodId: string,
    input: FixedAssetCreateInput,
  ): Promise<FixedAssetApiRecord>;
  patch(
    fiscalPeriodId: string,
    id: string,
    input: FixedAssetPatchInput,
  ): Promise<FixedAssetApiRecord>;
  delete(fiscalPeriodId: string, id: string): Promise<void>;
}

export interface MasterDataApi {
  getBookAccounts(): Promise<MasterBookAccount[]>;
  getTaxCategories(): Promise<MasterTaxCategory[]>;
  getBusinessCategories(): Promise<MasterBusinessCategory[]>;
}

export interface OpenkkServerPort {
  auth: AuthApi;
  closing: ClosingApi;
  entries: EntriesApi;
  fiscalPeriod: FiscalPeriodApi;
  fixedAssets: FixedAssetsApi;
  masterData: MasterDataApi;
}
