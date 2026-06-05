export type OpenkkApiErrorDto = {
  messageForDeveloper: string;
  messageForUser: string;
  originalMessage: string | null;
  statusCode: number | null;
};

export type OpenkkHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type OpenkkHttpSuccessStatus = 200 | 201 | 204;
export type OpenkkEmptyRequest = Record<string, never>;
export type OpenkkNoContentResponse = void;

export type StartAuthSessionRequest = { redirectUrl: string };
export type StartAuthSessionResponse = { authUrl: string };
export type CompleteAuthSessionRequest = { state: string; code: string };
export type CompleteAuthSessionResponse = { completionCode: string };
export type RedeemCompletionCodeRequest = { completionCode: string };
export type CreateTokenResponse = { userId: string };
export type RedeemCompletionCodeResponse = CreateTokenResponse;
export type AuthSignOutRequest = OpenkkEmptyRequest;
export type AuthSignOutResponse = OpenkkNoContentResponse;

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

export type FiscalPeriodDbRecord = FiscalPeriodApiRecord;
export type FiscalPeriodDbCreateInput = FiscalPeriodCreateInput;
export type FiscalPeriodDbPatchInput = FiscalPeriodPatchInput;
export type EntryDbRecord = EntryApiRecord;
export type EntryDbUpsertInput = EntryUpsertInput;
export type FixedAssetDbRecord = FixedAssetApiRecord;
export type FixedAssetDbCreateInput = FixedAssetCreateInput;
export type FixedAssetDbPatchInput = FixedAssetPatchInput;
export type ClosingDbRecord = ClosingApiRecord;
export type MasterBookAccountDbRecord = MasterBookAccount;
export type MasterTaxCategoryDbRecord = MasterTaxCategory;
export type MasterBusinessCategoryDbRecord = MasterBusinessCategory;

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
export type ClosingRunResponse = OpenkkNoContentResponse;
export type ClosingCancelRequest = { fiscalPeriodId: string; year: number };
export type ClosingCancelResponse = OpenkkNoContentResponse;

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
export type EntryRemoveResponse = OpenkkNoContentResponse;
export type EntryImportManyRequest = {
  fiscalPeriodId: string;
  entries: EntryUpsertInput[];
};
export type EntryImportManyResponse = {
  importedCount: number;
  entries: EntryApiRecord[];
};

export type FiscalPeriodsGetAllRequest = OpenkkEmptyRequest;
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
export type FiscalPeriodRemoveResponse = OpenkkNoContentResponse;

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
export type FixedAssetDeleteResponse = OpenkkNoContentResponse;

export type MasterBookAccountsRequest = OpenkkEmptyRequest;
export type MasterBookAccountsResponse = { bookAccounts: MasterBookAccount[] };
export type MasterTaxCategoriesRequest = OpenkkEmptyRequest;
export type MasterTaxCategoriesResponse = { taxCategories: MasterTaxCategory[] };
export type MasterBusinessCategoriesRequest = OpenkkEmptyRequest;
export type MasterBusinessCategoriesResponse = {
  businessCategories: MasterBusinessCategory[];
};

export type OpenkkHttpEndpointSpec<
  Request,
  Response,
  SuccessStatus extends OpenkkHttpSuccessStatus,
> = {
  method: OpenkkHttpMethod;
  path: string;
  successStatus: SuccessStatus;
  request: Request;
  response: Response;
};

export type OpenkkHttpEndpointSpecs = {
  authStartSession: OpenkkHttpEndpointSpec<StartAuthSessionRequest, StartAuthSessionResponse, 200>;
  authCompleteSession: OpenkkHttpEndpointSpec<CompleteAuthSessionRequest, CompleteAuthSessionResponse, 200>;
  authRedeemCompletionCode: OpenkkHttpEndpointSpec<RedeemCompletionCodeRequest, RedeemCompletionCodeResponse, 200>;
  authSignOut: OpenkkHttpEndpointSpec<AuthSignOutRequest, AuthSignOutResponse, 204>;
  closingGet: OpenkkHttpEndpointSpec<ClosingGetRequest, ClosingGetResponse, 200>;
  closingRun: OpenkkHttpEndpointSpec<ClosingRunRequest, ClosingRunResponse, 204>;
  closingCancel: OpenkkHttpEndpointSpec<ClosingCancelRequest, ClosingCancelResponse, 204>;
  entriesGetAll: OpenkkHttpEndpointSpec<EntriesGetAllRequest, EntriesGetAllResponse, 200>;
  entryCreate: OpenkkHttpEndpointSpec<EntryCreateRequest, EntryCreateResponse, 201>;
  entryPatch: OpenkkHttpEndpointSpec<EntryPatchRequest, EntryPatchResponse, 200>;
  entryRemove: OpenkkHttpEndpointSpec<EntryRemoveRequest, EntryRemoveResponse, 204>;
  entryImportMany: OpenkkHttpEndpointSpec<EntryImportManyRequest, EntryImportManyResponse, 200>;
  fiscalPeriodsGetAll: OpenkkHttpEndpointSpec<FiscalPeriodsGetAllRequest, FiscalPeriodsGetAllResponse, 200>;
  fiscalPeriodCreate: OpenkkHttpEndpointSpec<FiscalPeriodCreateRequest, FiscalPeriodCreateResponse, 201>;
  fiscalPeriodImportArchived: OpenkkHttpEndpointSpec<FiscalPeriodImportArchivedRequest, FiscalPeriodImportArchivedResponse, 201>;
  fiscalPeriodPatch: OpenkkHttpEndpointSpec<FiscalPeriodPatchRequest, FiscalPeriodPatchResponse, 200>;
  fiscalPeriodRemove: OpenkkHttpEndpointSpec<FiscalPeriodRemoveRequest, FiscalPeriodRemoveResponse, 204>;
  fixedAssetsGetAll: OpenkkHttpEndpointSpec<FixedAssetsGetAllRequest, FixedAssetsGetAllResponse, 200>;
  fixedAssetCreate: OpenkkHttpEndpointSpec<FixedAssetCreateRequest, FixedAssetCreateResponse, 201>;
  fixedAssetPatch: OpenkkHttpEndpointSpec<FixedAssetPatchRequest, FixedAssetPatchResponse, 200>;
  fixedAssetDelete: OpenkkHttpEndpointSpec<FixedAssetDeleteRequest, FixedAssetDeleteResponse, 204>;
  masterBookAccounts: OpenkkHttpEndpointSpec<MasterBookAccountsRequest, MasterBookAccountsResponse, 200>;
  masterTaxCategories: OpenkkHttpEndpointSpec<MasterTaxCategoriesRequest, MasterTaxCategoriesResponse, 200>;
  masterBusinessCategories: OpenkkHttpEndpointSpec<MasterBusinessCategoriesRequest, MasterBusinessCategoriesResponse, 200>;
};

export type OpenkkHttpEndpointKey = keyof OpenkkHttpEndpointSpecs;

export const OPENKK_HTTP_ENDPOINTS = {
  authStartSession: { method: "POST", path: "/auth/session/start", successStatus: 200 },
  authCompleteSession: { method: "POST", path: "/auth/session/complete", successStatus: 200 },
  authRedeemCompletionCode: { method: "POST", path: "/auth/token", successStatus: 200 },
  authSignOut: { method: "POST", path: "/auth/sign-out", successStatus: 204 },
  closingGet: { method: "GET", path: "/fiscal-periods/{fiscalPeriodId}/closings/{year}", successStatus: 200 },
  closingRun: { method: "PUT", path: "/fiscal-periods/{fiscalPeriodId}/closings/{year}", successStatus: 204 },
  closingCancel: { method: "DELETE", path: "/fiscal-periods/{fiscalPeriodId}/closings/{year}", successStatus: 204 },
  entriesGetAll: { method: "GET", path: "/fiscal-periods/{fiscalPeriodId}/entries", successStatus: 200 },
  entryCreate: { method: "POST", path: "/fiscal-periods/{fiscalPeriodId}/entries", successStatus: 201 },
  entryPatch: { method: "PUT", path: "/fiscal-periods/{fiscalPeriodId}/entries/{id}", successStatus: 200 },
  entryRemove: { method: "DELETE", path: "/fiscal-periods/{fiscalPeriodId}/entries/{id}", successStatus: 204 },
  entryImportMany: { method: "POST", path: "/fiscal-periods/{fiscalPeriodId}/entries/import", successStatus: 200 },
  fiscalPeriodsGetAll: { method: "GET", path: "/fiscal-periods", successStatus: 200 },
  fiscalPeriodCreate: { method: "POST", path: "/fiscal-periods", successStatus: 201 },
  fiscalPeriodImportArchived: { method: "POST", path: "/fiscal-periods/import-archived", successStatus: 201 },
  fiscalPeriodPatch: { method: "PATCH", path: "/fiscal-periods/{id}", successStatus: 200 },
  fiscalPeriodRemove: { method: "DELETE", path: "/fiscal-periods/{id}", successStatus: 204 },
  fixedAssetsGetAll: { method: "GET", path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets", successStatus: 200 },
  fixedAssetCreate: { method: "POST", path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets", successStatus: 201 },
  fixedAssetPatch: { method: "PATCH", path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets/{id}", successStatus: 200 },
  fixedAssetDelete: { method: "DELETE", path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets/{id}", successStatus: 204 },
  masterBookAccounts: { method: "GET", path: "/master/book-accounts", successStatus: 200 },
  masterTaxCategories: { method: "GET", path: "/master/tax-categories", successStatus: 200 },
  masterBusinessCategories: { method: "GET", path: "/master/business-categories", successStatus: 200 },
} as const satisfies {
  [Key in OpenkkHttpEndpointKey]: Pick<
    OpenkkHttpEndpointSpecs[Key],
    "method" | "path" | "successStatus"
  >;
};

export interface AuthApi {
  startSession(redirectUrl: string): Promise<StartAuthSessionResponse>;
  completeSession(input: {
    state: string;
    code: string;
  }): Promise<CompleteAuthSessionResponse>;
  redeemCompletionCode(completionCode: string): Promise<RedeemCompletionCodeResponse>;
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
