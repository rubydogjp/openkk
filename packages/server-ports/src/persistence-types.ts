export type FiscalPeriodDbPhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

export type FiscalPeriodDbArchiveStatus = "active" | "archived";

export type OpeningBalanceLineDbRecord = {
  id: string;
  accountId: string;
  amount: number;
};

export type OpeningJournalLineDbRecord = {
  id: string;
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type OpeningJournalDbRecord = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: OpeningJournalLineDbRecord[];
};

export type FiscalPeriodOpeningDbRecord = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  createdAt: string;
  updatedAt: string;
  openingBalanceLines?: OpeningBalanceLineDbRecord[];
  openingJournals?: OpeningJournalDbRecord[];
};

export type FiscalPeriodDbRecord = {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodDbPhase;
  archiveStatus: FiscalPeriodDbArchiveStatus;
  archiveDataAvailable?: boolean;
  archivedAt?: string | null;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening?: FiscalPeriodOpeningDbRecord | null;
  createdAt: string;
  updatedAt: string;
};

export type FiscalPeriodDbCreateInput = {
  name: string;
  startDate: string;
  endDate: string;
};

export type FiscalPeriodDbPatchInput = Partial<{
  name: string;
  startDate: string;
  endDate: string;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening: Required<
    Omit<FiscalPeriodOpeningDbRecord, "createdAt" | "updatedAt">
  >;
}>;

export type EntryDbLine = {
  id: string;
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type EntryDbLineInput = Omit<EntryDbLine, "id">;

export type EntryDbRecord = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  localId: string;
  businessRate: number;
  lines: EntryDbLine[];
  createdAt: string;
  updatedAt: string;
};

export type EntryDbUpsertInput = {
  date: string;
  description: string;
  localId?: string;
  businessRate: number;
  lines: EntryDbLineInput[];
};

export type FixedAssetDbStatus = "active" | "sold" | "disposed" | "retired";

export type FixedAssetDbRecord = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: FixedAssetDbStatus;
  disposalDate: string;
  disposalPrice: number;
  bookAccountId: string;
  createdAt: string;
  updatedAt: string;
};

export type FixedAssetDbCreateInput = {
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  bookAccountId: string;
};

export type FixedAssetDbPatchInput = Partial<
  Omit<
    FixedAssetDbRecord,
    "id" | "userId" | "fiscalPeriodId" | "createdAt" | "updatedAt"
  >
>;

export type PreClosingDbRecord = Record<string, never>;
export type ClosingDbRecord = Record<string, never>;

export type MasterBookAccountDbNormalBalanceSide = "debit" | "credit";

export type MasterBookAccountDbBalanceSheetSection =
  | "current_asset"
  | "fixed_asset"
  | "deferred_asset"
  | "current_liability"
  | "long_term_liability"
  | "equity"
  | "none";

export type MasterBookAccountDbRecord = {
  id: string;
  name: string;
  description: string;
  kana: string;
  normalBalanceSide: MasterBookAccountDbNormalBalanceSide;
  accountType:
    | "asset"
    | "liability"
    | "equity"
    | "revenue"
    | "cost_of_sales"
    | "expense";
  balanceSheetSection: MasterBookAccountDbBalanceSheetSection;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MasterTaxCategoryDbRecord = {
  id: string;
  name: string;
  rate: number;
  createdAt: string;
  updatedAt: string;
};

export type MasterBusinessCategoryDbRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type FiscalPeriodArchiveDbImportInput = {
  fiscalPeriod: {
    name: string;
    startDate: string;
    endDate: string;
    phase: FiscalPeriodDbPhase;
    archiveStatus: "active";
    settingsCompleted: boolean;
    openingBalancesCompleted: boolean;
    documentsReceivedCompleted: boolean;
    opening?: FiscalPeriodDbPatchInput["opening"];
  };
  entries: EntryDbUpsertInput[];
  fixedAssets: Array<{
    createInput: FixedAssetDbCreateInput;
    patchInput?: FixedAssetDbPatchInput;
  }>;
  preClosings: Array<{ year: number }>;
  closings: Array<{ year: number }>;
};
