export type OpenkkApiErrorDto = {
  messageForDeveloper: string;
  messageForUser: string;
  originalMessage: string | null;
  statusCode: number | null;
};

export type StartAuthSessionRequest = { redirectUrl: string };
export type StartAuthSessionResponse = { authUrl: string };
export type CompleteAuthSessionRequest = { state: string; code: string };
export type CompleteAuthSessionResponse = { completionCode: string };
export type RedeemCompletionCodeRequest = { completionCode: string };
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

export type ClosingGetRequest = { fiscalPeriodId: string; year: number };
export type ClosingGetResponse = { closing: ClosingApiRecord | null };
export type ClosingRunRequest = {
  fiscalPeriodId: string;
  year: number;
  isProvisional: boolean;
};
export type ClosingCancelRequest = { fiscalPeriodId: string; year: number };

export type EntriesGetAllRequest = { fiscalPeriodId: string };
export type EntriesGetAllResponse = { entries: EntryApiRecord[] };
export type EntryCreateRequest = {
  fiscalPeriodId: string;
  input: EntryUpsertInput;
};
export type EntryCreateResponse = { entry: EntryApiRecord };
export type EntryPatchRequest = {
  fiscalPeriodId: string;
  id: string;
  input: EntryUpsertInput;
};
export type EntryPatchResponse = { entry: EntryApiRecord };
export type EntryRemoveRequest = { fiscalPeriodId: string; id: string };
export type EntryImportManyRequest = {
  fiscalPeriodId: string;
  entries: EntryUpsertInput[];
};
export type EntryImportManyResponse = {
  importedCount: number;
  entries: EntryApiRecord[];
};

export type FiscalPeriodsGetAllResponse = {
  fiscalPeriods: FiscalPeriodApiRecord[];
};
export type FiscalPeriodCreateRequest = { input: FiscalPeriodCreateInput };
export type FiscalPeriodCreateResponse = { fiscalPeriod: FiscalPeriodApiRecord };
export type FiscalPeriodImportArchivedRequest = {
  input: FiscalPeriodArchiveImportInput;
};
export type FiscalPeriodImportArchivedResponse = {
  fiscalPeriod: FiscalPeriodApiRecord;
};
export type FiscalPeriodPatchRequest = {
  id: string;
  input: FiscalPeriodPatchInput;
};
export type FiscalPeriodPatchResponse = { fiscalPeriod: FiscalPeriodApiRecord };
export type FiscalPeriodRemoveRequest = { id: string };

export type FixedAssetsGetAllRequest = { fiscalPeriodId: string };
export type FixedAssetsGetAllResponse = { fixedAssets: FixedAssetApiRecord[] };
export type FixedAssetCreateRequest = {
  fiscalPeriodId: string;
  input: FixedAssetCreateInput;
};
export type FixedAssetCreateResponse = { fixedAsset: FixedAssetApiRecord };
export type FixedAssetPatchRequest = {
  fiscalPeriodId: string;
  id: string;
  input: FixedAssetPatchInput;
};
export type FixedAssetPatchResponse = { fixedAsset: FixedAssetApiRecord };
export type FixedAssetDeleteRequest = { fiscalPeriodId: string; id: string };

export type MasterBookAccountsResponse = { bookAccounts: MasterBookAccount[] };
export type MasterTaxCategoriesResponse = { taxCategories: MasterTaxCategory[] };
export type MasterBusinessCategoriesResponse = {
  businessCategories: MasterBusinessCategory[];
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
  /**
   * Idempotent on `localId`: inputs whose `localId` already exists in the
   * fiscal period are skipped. `importedCount` and `entries` cover only the
   * rows actually inserted, so callers can derive skipped = inputs - imported.
   */
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

export interface OpenkkBackendPort {
  auth: AuthApi;
  closing: ClosingApi;
  entries: EntriesApi;
  fiscalPeriod: FiscalPeriodApi;
  fixedAssets: FixedAssetsApi;
  masterData: MasterDataApi;
}
