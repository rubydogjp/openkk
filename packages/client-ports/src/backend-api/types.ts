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

export type PreClosingApiRecord = Record<string, never>;
export type ClosingApiRecord = Record<string, never>;

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
  phase:
    | "pre_opening"
    | "journalizing"
    | "pre_closing"
    | "post_closing";
  archiveStatus: "active" | "archived";
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

export type PreClosingGetRequest = { fiscalPeriodId: string; year: number };
export type PreClosingGetResponse = { preClosing: PreClosingApiRecord | null };
export type PreClosingRunRequest = { fiscalPeriodId: string; year: number };
export type PreClosingRunResponse = { fiscalPeriod: FiscalPeriodApiRecord };
export type PreClosingCancelRequest = { fiscalPeriodId: string; year: number };
export type PreClosingCancelResponse = { fiscalPeriod: FiscalPeriodApiRecord };

export type ClosingGetRequest = { fiscalPeriodId: string; year: number };
export type ClosingGetResponse = { closing: ClosingApiRecord | null };
export type ClosingRunRequest = { fiscalPeriodId: string; year: number };
export type ClosingRunResponse = { fiscalPeriod: FiscalPeriodApiRecord };

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
export type FiscalPeriodArchiveRequest = { id: string };
export type FiscalPeriodArchiveResponse = { fiscalPeriod: FiscalPeriodApiRecord };
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
  preClosingGet: OpenkkHttpEndpointSpec<PreClosingGetRequest, PreClosingGetResponse, 200>;
  preClosingRun: OpenkkHttpEndpointSpec<PreClosingRunRequest, PreClosingRunResponse, 200>;
  preClosingCancel: OpenkkHttpEndpointSpec<PreClosingCancelRequest, PreClosingCancelResponse, 200>;
  closingGet: OpenkkHttpEndpointSpec<ClosingGetRequest, ClosingGetResponse, 200>;
  closingRun: OpenkkHttpEndpointSpec<ClosingRunRequest, ClosingRunResponse, 200>;
  entriesGetAll: OpenkkHttpEndpointSpec<EntriesGetAllRequest, EntriesGetAllResponse, 200>;
  entryCreate: OpenkkHttpEndpointSpec<EntryCreateRequest, EntryCreateResponse, 201>;
  entryPatch: OpenkkHttpEndpointSpec<EntryPatchRequest, EntryPatchResponse, 200>;
  entryRemove: OpenkkHttpEndpointSpec<EntryRemoveRequest, EntryRemoveResponse, 204>;
  entryImportMany: OpenkkHttpEndpointSpec<EntryImportManyRequest, EntryImportManyResponse, 200>;
  fiscalPeriodsGetAll: OpenkkHttpEndpointSpec<FiscalPeriodsGetAllRequest, FiscalPeriodsGetAllResponse, 200>;
  fiscalPeriodCreate: OpenkkHttpEndpointSpec<FiscalPeriodCreateRequest, FiscalPeriodCreateResponse, 201>;
  fiscalPeriodImportArchived: OpenkkHttpEndpointSpec<FiscalPeriodImportArchivedRequest, FiscalPeriodImportArchivedResponse, 201>;
  fiscalPeriodPatch: OpenkkHttpEndpointSpec<FiscalPeriodPatchRequest, FiscalPeriodPatchResponse, 200>;
  fiscalPeriodArchive: OpenkkHttpEndpointSpec<FiscalPeriodArchiveRequest, FiscalPeriodArchiveResponse, 200>;
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
  preClosingGet: { method: "GET", path: "/fiscal-periods/{fiscalPeriodId}/pre-closings/{year}", successStatus: 200 },
  preClosingRun: { method: "PUT", path: "/fiscal-periods/{fiscalPeriodId}/pre-closings/{year}", successStatus: 200 },
  preClosingCancel: { method: "DELETE", path: "/fiscal-periods/{fiscalPeriodId}/pre-closings/{year}", successStatus: 200 },
  closingGet: { method: "GET", path: "/fiscal-periods/{fiscalPeriodId}/closings/{year}", successStatus: 200 },
  closingRun: { method: "PUT", path: "/fiscal-periods/{fiscalPeriodId}/closings/{year}", successStatus: 200 },
  entriesGetAll: { method: "GET", path: "/fiscal-periods/{fiscalPeriodId}/entries", successStatus: 200 },
  entryCreate: { method: "POST", path: "/fiscal-periods/{fiscalPeriodId}/entries", successStatus: 201 },
  entryPatch: { method: "PUT", path: "/fiscal-periods/{fiscalPeriodId}/entries/{id}", successStatus: 200 },
  entryRemove: { method: "DELETE", path: "/fiscal-periods/{fiscalPeriodId}/entries/{id}", successStatus: 204 },
  entryImportMany: { method: "POST", path: "/fiscal-periods/{fiscalPeriodId}/entries/import", successStatus: 200 },
  fiscalPeriodsGetAll: { method: "GET", path: "/fiscal-periods", successStatus: 200 },
  fiscalPeriodCreate: { method: "POST", path: "/fiscal-periods", successStatus: 201 },
  fiscalPeriodImportArchived: { method: "POST", path: "/fiscal-periods/import-archived", successStatus: 201 },
  fiscalPeriodPatch: { method: "PATCH", path: "/fiscal-periods/{id}", successStatus: 200 },
  fiscalPeriodArchive: { method: "POST", path: "/fiscal-periods/{id}/archive", successStatus: 200 },
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
  run(input: { fiscalPeriodId: string; year: number }): Promise<FiscalPeriodApiRecord>;
}

export interface PreClosingApi {
  get(fiscalPeriodId: string, year: number): Promise<PreClosingApiRecord | null>;
  run(input: { fiscalPeriodId: string; year: number }): Promise<FiscalPeriodApiRecord>;
  cancel(fiscalPeriodId: string, year: number): Promise<FiscalPeriodApiRecord>;
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
  archive(id: string): Promise<FiscalPeriodApiRecord>;
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
  preClosing: PreClosingApi;
  closing: ClosingApi;
  entries: EntriesApi;
  fiscalPeriod: FiscalPeriodApi;
  fixedAssets: FixedAssetsApi;
  masterData: MasterDataApi;
}
