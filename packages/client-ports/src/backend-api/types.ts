export type OpenkkApiErrorDto = {
  messageForDeveloper: string;
  messageForUser: string;
  originalMessage: string | null;
  statusCode: number | null;
  code: string | null;
};

export const MAINTENANCE_MODE_ERROR_CODE = "maintenance_mode_enabled";

export type OpenkkHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type OpenkkHttpSuccessStatus = 200 | 201 | 204;
export type OpenkkEmptyRequest = Record<string, never>;
export type OpenkkNoContentResponse = null;

export type StartAuthSessionRequest = { redirectUrl: string };
export type StartAuthSessionResponse = { authUrl: string };
export type CompleteAuthSessionRequest = { state: string; code: string };
export type CompleteAuthSessionResponse = { completionCode: string };
export type RedeemCompletionCodeRequest = { completionCode: string };
export type RedeemCompletionCodeResponse = {
  userId: string;
  displayName: string | null;
  email: string | null;
  iconUrl: string | null;
  authProvider: string | null;
};
export type AuthSignOutRequest = OpenkkEmptyRequest;
export type AuthSignOutResponse = OpenkkNoContentResponse;

export type EntryApiSide = "debit" | "credit";

export type FiscalPeriodApiPhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

export type FiscalPeriodApiArchiveStatus = "active" | "archived" | "purged";

export type FixedAssetApiStatus = "active" | "sold" | "disposed" | "retired";

export type MasterBookAccountApiAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "expense";

export type EntryLineApiRecord = {
  id: string;
  side: EntryApiSide;
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type EntryLineInput = {
  side: EntryApiSide;
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type EntryApiRecord = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryLineApiRecord[];
  createdAt: string;
  updatedAt: string;
};

export type EntryUpsertInput = {
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryLineInput[];
};

export type OpeningBalanceLineApiRecord = {
  id: string;
  accountId: string;
  amount: number;
};

export type OpeningJournalApiRecord = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: EntryLineApiRecord[];
};

export type FiscalPeriodOpeningApiRecord = {
  openingBalanceLines: OpeningBalanceLineApiRecord[];
  openingJournals: OpeningJournalApiRecord[];
};

export type FiscalPeriodApiRecord = {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodApiPhase;
  archiveStatus: FiscalPeriodApiArchiveStatus;
  archivedAt: string | null;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening: FiscalPeriodOpeningApiRecord;
  createdAt: string;
  updatedAt: string;
};

export type FiscalPeriodCreateInput = {
  name: string;
  startDate: string;
  endDate: string;
};

export type FiscalPeriodNextCreateInput = {
  sourceFiscalPeriodId: string;
  name: string;
  startDate: string;
  endDate: string;
  carryBalances: boolean;
  reversalEntryIds: string[];
  carryFixedAssets: boolean;
};

export type FiscalPeriodPatchInput = {
  name?: string;
  startDate?: string;
  endDate?: string;
  openingBalancesCompleted?: boolean;
  documentsReceivedCompleted?: boolean;
  opening?: FiscalPeriodOpeningApiRecord;
};

export type FiscalPeriodArchiveImportInput = {
  manifest: Record<string, unknown>;
  fiscalPeriod: Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  fixedAssets: Array<Record<string, unknown>>;
  closings: Array<Record<string, unknown>>;
};

export type FixedAssetApiRecord = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: FixedAssetApiStatus;
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
  createdAt: string;
  updatedAt: string;
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
  status?: FixedAssetApiStatus;
  disposalDate?: string | null;
  disposalPrice?: number | null;
  bookAccountId?: string;
};

export type MasterBookAccountApiNormalBalanceSide = "debit" | "credit";

export type MasterBookAccountApiBalanceSheetSection =
  | "current_asset"
  | "fixed_asset"
  | "deferred_asset"
  | "current_liability"
  | "long_term_liability"
  | "equity"
  | "none";

export type MasterBookAccountApiRecord = {
  id: string;
  name: string;
  description: string;
  kana: string;
  normalBalanceSide: MasterBookAccountApiNormalBalanceSide;
  accountType: MasterBookAccountApiAccountType;
  balanceSheetSection: MasterBookAccountApiBalanceSheetSection;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MasterTaxCategoryApiRecord = {
  id: string;
  name: string;
  rate: number;
  createdAt: string;
  updatedAt: string;
};

export type MasterBusinessCategoryApiRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceStatus = {
  enabled: boolean;
  title: string;
  message: string;
  updatedAt: string | null;
};

export type MaintenanceGetRequest = OpenkkEmptyRequest;
export type MaintenanceGetResponse = MaintenanceStatus;

export type PreClosingGetRequest = { fiscalPeriodId: string; year: number };
export type PreClosingGetResponse = { preClosed: boolean };
export type PreClosingRunRequest = { fiscalPeriodId: string; year: number };
export type PreClosingRunResponse = { fiscalPeriod: FiscalPeriodApiRecord };
export type PreClosingCancelRequest = { fiscalPeriodId: string; year: number };
export type PreClosingCancelResponse = { fiscalPeriod: FiscalPeriodApiRecord };

export type ClosingGetRequest = { fiscalPeriodId: string; year: number };
export type ClosingGetResponse = { closed: boolean };
export type ClosingRunRequest = {
  fiscalPeriodId: string;
  year: number;
  entries: EntryUpsertInput[];
};
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
export type FiscalPeriodCreateResponse = {
  fiscalPeriod: FiscalPeriodApiRecord;
};
export type FiscalPeriodNextCreateRequest = { input: FiscalPeriodNextCreateInput };
export type FiscalPeriodNextCreateResponse = {
  fiscalPeriod: FiscalPeriodApiRecord;
};
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
export type FiscalPeriodStartRequest = { id: string };
export type FiscalPeriodStartResponse = { fiscalPeriod: FiscalPeriodApiRecord };
export type FiscalPeriodArchiveRequest = { id: string };
export type FiscalPeriodArchiveResponse = {
  fiscalPeriod: FiscalPeriodApiRecord;
};
export type FiscalPeriodPurgeArchivedDataRequest = { id: string };
export type FiscalPeriodPurgeArchivedDataResponse = {
  fiscalPeriod: FiscalPeriodApiRecord;
};
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
export type FixedAssetRemoveRequest = { fiscalPeriodId: string; id: string };
export type FixedAssetRemoveResponse = OpenkkNoContentResponse;

export type MasterBookAccountsRequest = OpenkkEmptyRequest;
export type MasterBookAccountsResponse = {
  bookAccounts: MasterBookAccountApiRecord[];
};
export type MasterTaxCategoriesRequest = OpenkkEmptyRequest;
export type MasterTaxCategoriesResponse = {
  taxCategories: MasterTaxCategoryApiRecord[];
};
export type MasterBusinessCategoriesRequest = OpenkkEmptyRequest;
export type MasterBusinessCategoriesResponse = {
  businessCategories: MasterBusinessCategoryApiRecord[];
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
  authStartSession: OpenkkHttpEndpointSpec<
    StartAuthSessionRequest,
    StartAuthSessionResponse,
    200
  >;
  authCompleteSession: OpenkkHttpEndpointSpec<
    CompleteAuthSessionRequest,
    CompleteAuthSessionResponse,
    200
  >;
  authRedeemCompletionCode: OpenkkHttpEndpointSpec<
    RedeemCompletionCodeRequest,
    RedeemCompletionCodeResponse,
    200
  >;
  authSignOut: OpenkkHttpEndpointSpec<
    AuthSignOutRequest,
    AuthSignOutResponse,
    204
  >;
  preClosingGet: OpenkkHttpEndpointSpec<
    PreClosingGetRequest,
    PreClosingGetResponse,
    200
  >;
  preClosingRun: OpenkkHttpEndpointSpec<
    PreClosingRunRequest,
    PreClosingRunResponse,
    200
  >;
  preClosingCancel: OpenkkHttpEndpointSpec<
    PreClosingCancelRequest,
    PreClosingCancelResponse,
    200
  >;
  closingGet: OpenkkHttpEndpointSpec<
    ClosingGetRequest,
    ClosingGetResponse,
    200
  >;
  closingRun: OpenkkHttpEndpointSpec<
    ClosingRunRequest,
    ClosingRunResponse,
    200
  >;
  entriesGetAll: OpenkkHttpEndpointSpec<
    EntriesGetAllRequest,
    EntriesGetAllResponse,
    200
  >;
  entryCreate: OpenkkHttpEndpointSpec<
    EntryCreateRequest,
    EntryCreateResponse,
    201
  >;
  entryPatch: OpenkkHttpEndpointSpec<
    EntryPatchRequest,
    EntryPatchResponse,
    200
  >;
  entryRemove: OpenkkHttpEndpointSpec<
    EntryRemoveRequest,
    EntryRemoveResponse,
    204
  >;
  entryImportMany: OpenkkHttpEndpointSpec<
    EntryImportManyRequest,
    EntryImportManyResponse,
    200
  >;
  fiscalPeriodsGetAll: OpenkkHttpEndpointSpec<
    FiscalPeriodsGetAllRequest,
    FiscalPeriodsGetAllResponse,
    200
  >;
  fiscalPeriodCreate: OpenkkHttpEndpointSpec<
    FiscalPeriodCreateRequest,
    FiscalPeriodCreateResponse,
    201
  >;
  fiscalPeriodNextCreate: OpenkkHttpEndpointSpec<
    FiscalPeriodNextCreateRequest,
    FiscalPeriodNextCreateResponse,
    201
  >;
  fiscalPeriodImportArchived: OpenkkHttpEndpointSpec<
    FiscalPeriodImportArchivedRequest,
    FiscalPeriodImportArchivedResponse,
    201
  >;
  fiscalPeriodPatch: OpenkkHttpEndpointSpec<
    FiscalPeriodPatchRequest,
    FiscalPeriodPatchResponse,
    200
  >;
  fiscalPeriodStart: OpenkkHttpEndpointSpec<
    FiscalPeriodStartRequest,
    FiscalPeriodStartResponse,
    200
  >;
  fiscalPeriodArchive: OpenkkHttpEndpointSpec<
    FiscalPeriodArchiveRequest,
    FiscalPeriodArchiveResponse,
    200
  >;
  fiscalPeriodPurgeArchivedData: OpenkkHttpEndpointSpec<
    FiscalPeriodPurgeArchivedDataRequest,
    FiscalPeriodPurgeArchivedDataResponse,
    200
  >;
  fiscalPeriodRemove: OpenkkHttpEndpointSpec<
    FiscalPeriodRemoveRequest,
    FiscalPeriodRemoveResponse,
    204
  >;
  fixedAssetsGetAll: OpenkkHttpEndpointSpec<
    FixedAssetsGetAllRequest,
    FixedAssetsGetAllResponse,
    200
  >;
  fixedAssetCreate: OpenkkHttpEndpointSpec<
    FixedAssetCreateRequest,
    FixedAssetCreateResponse,
    201
  >;
  fixedAssetPatch: OpenkkHttpEndpointSpec<
    FixedAssetPatchRequest,
    FixedAssetPatchResponse,
    200
  >;
  fixedAssetRemove: OpenkkHttpEndpointSpec<
    FixedAssetRemoveRequest,
    FixedAssetRemoveResponse,
    204
  >;
  masterBookAccounts: OpenkkHttpEndpointSpec<
    MasterBookAccountsRequest,
    MasterBookAccountsResponse,
    200
  >;
  masterTaxCategories: OpenkkHttpEndpointSpec<
    MasterTaxCategoriesRequest,
    MasterTaxCategoriesResponse,
    200
  >;
  masterBusinessCategories: OpenkkHttpEndpointSpec<
    MasterBusinessCategoriesRequest,
    MasterBusinessCategoriesResponse,
    200
  >;
  maintenanceGet: OpenkkHttpEndpointSpec<
    MaintenanceGetRequest,
    MaintenanceGetResponse,
    200
  >;
};

export type OpenkkHttpEndpointKey = keyof OpenkkHttpEndpointSpecs;

export const OPENKK_HTTP_ENDPOINTS = {
  authStartSession: {
    method: "POST",
    path: "/auth/session/start",
    successStatus: 200,
  },
  authCompleteSession: {
    method: "POST",
    path: "/auth/session/complete",
    successStatus: 200,
  },
  authRedeemCompletionCode: {
    method: "POST",
    path: "/auth/token",
    successStatus: 200,
  },
  authSignOut: { method: "POST", path: "/auth/sign-out", successStatus: 204 },
  preClosingGet: {
    method: "GET",
    path: "/fiscal-periods/{fiscalPeriodId}/pre-closings/{year}",
    successStatus: 200,
  },
  preClosingRun: {
    method: "PUT",
    path: "/fiscal-periods/{fiscalPeriodId}/pre-closings/{year}",
    successStatus: 200,
  },
  preClosingCancel: {
    method: "DELETE",
    path: "/fiscal-periods/{fiscalPeriodId}/pre-closings/{year}",
    successStatus: 200,
  },
  closingGet: {
    method: "GET",
    path: "/fiscal-periods/{fiscalPeriodId}/closings/{year}",
    successStatus: 200,
  },
  closingRun: {
    method: "PUT",
    path: "/fiscal-periods/{fiscalPeriodId}/closings/{year}",
    successStatus: 200,
  },
  entriesGetAll: {
    method: "GET",
    path: "/fiscal-periods/{fiscalPeriodId}/entries",
    successStatus: 200,
  },
  entryCreate: {
    method: "POST",
    path: "/fiscal-periods/{fiscalPeriodId}/entries",
    successStatus: 201,
  },
  entryPatch: {
    method: "PUT",
    path: "/fiscal-periods/{fiscalPeriodId}/entries/{id}",
    successStatus: 200,
  },
  entryRemove: {
    method: "DELETE",
    path: "/fiscal-periods/{fiscalPeriodId}/entries/{id}",
    successStatus: 204,
  },
  entryImportMany: {
    method: "POST",
    path: "/fiscal-periods/{fiscalPeriodId}/entries/import",
    successStatus: 200,
  },
  fiscalPeriodsGetAll: {
    method: "GET",
    path: "/fiscal-periods",
    successStatus: 200,
  },
  fiscalPeriodCreate: {
    method: "POST",
    path: "/fiscal-periods",
    successStatus: 201,
  },
  fiscalPeriodNextCreate: {
    method: "POST",
    path: "/fiscal-periods/create-next",
    successStatus: 201,
  },
  fiscalPeriodImportArchived: {
    method: "POST",
    path: "/fiscal-periods/import-archived",
    successStatus: 201,
  },
  fiscalPeriodPatch: {
    method: "PATCH",
    path: "/fiscal-periods/{id}",
    successStatus: 200,
  },
  fiscalPeriodStart: {
    method: "POST",
    path: "/fiscal-periods/{id}/start",
    successStatus: 200,
  },
  fiscalPeriodArchive: {
    method: "POST",
    path: "/fiscal-periods/{id}/archive",
    successStatus: 200,
  },
  fiscalPeriodPurgeArchivedData: {
    method: "POST",
    path: "/fiscal-periods/{id}/purge-archived-data",
    successStatus: 200,
  },
  fiscalPeriodRemove: {
    method: "DELETE",
    path: "/fiscal-periods/{id}",
    successStatus: 204,
  },
  fixedAssetsGetAll: {
    method: "GET",
    path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets",
    successStatus: 200,
  },
  fixedAssetCreate: {
    method: "POST",
    path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets",
    successStatus: 201,
  },
  fixedAssetPatch: {
    method: "PATCH",
    path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets/{id}",
    successStatus: 200,
  },
  fixedAssetRemove: {
    method: "DELETE",
    path: "/fiscal-periods/{fiscalPeriodId}/fixed-assets/{id}",
    successStatus: 204,
  },
  masterBookAccounts: {
    method: "GET",
    path: "/master/book-accounts",
    successStatus: 200,
  },
  masterTaxCategories: {
    method: "GET",
    path: "/master/tax-categories",
    successStatus: 200,
  },
  masterBusinessCategories: {
    method: "GET",
    path: "/master/business-categories",
    successStatus: 200,
  },
  maintenanceGet: {
    method: "GET",
    path: "/maintenance",
    successStatus: 200,
  },
} as const satisfies {
  [Key in OpenkkHttpEndpointKey]: Pick<
    OpenkkHttpEndpointSpecs[Key],
    "method" | "path" | "successStatus"
  >;
};

export interface AuthApi {
  startSession(redirectUrl: string): Promise<StartAuthSessionResponse>;
  completeSession(
    input: CompleteAuthSessionRequest,
  ): Promise<CompleteAuthSessionResponse>;
  redeemCompletionCode(
    completionCode: string,
  ): Promise<RedeemCompletionCodeResponse>;
  signOut(): Promise<void>;
}

export interface ClosingsApi {
  get(fiscalPeriodId: string, year: number): Promise<boolean>;
  run(input: ClosingRunRequest): Promise<FiscalPeriodApiRecord>;
}

export interface PreClosingsApi {
  get(fiscalPeriodId: string, year: number): Promise<boolean>;
  run(input: PreClosingRunRequest): Promise<FiscalPeriodApiRecord>;
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
  importMany(
    fiscalPeriodId: string,
    entries: EntryUpsertInput[],
  ): Promise<{ importedCount: number; entries: EntryApiRecord[] }>;
}

export interface FiscalPeriodsApi {
  getAll(): Promise<FiscalPeriodApiRecord[]>;
  create(input: FiscalPeriodCreateInput): Promise<FiscalPeriodApiRecord>;
  createNext(input: FiscalPeriodNextCreateInput): Promise<FiscalPeriodApiRecord>;
  importArchived(
    input: FiscalPeriodArchiveImportInput,
  ): Promise<FiscalPeriodApiRecord>;
  start(id: string): Promise<FiscalPeriodApiRecord>;
  archive(id: string): Promise<FiscalPeriodApiRecord>;
  purgeArchivedData(id: string): Promise<FiscalPeriodApiRecord>;
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
  remove(fiscalPeriodId: string, id: string): Promise<void>;
}

export interface MasterDataApi {
  getBookAccounts(): Promise<MasterBookAccountApiRecord[]>;
  getTaxCategories(): Promise<MasterTaxCategoryApiRecord[]>;
  getBusinessCategories(): Promise<MasterBusinessCategoryApiRecord[]>;
}

export interface MaintenanceApi {
  get(): Promise<MaintenanceStatus>;
}

export interface OpenkkBackendPort {
  auth: AuthApi;
  preClosings: PreClosingsApi;
  closings: ClosingsApi;
  entries: EntriesApi;
  fiscalPeriods: FiscalPeriodsApi;
  fixedAssets: FixedAssetsApi;
  masterData: MasterDataApi;
  maintenance: MaintenanceApi;
}
