export type FiscalPeriodDbPhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

export type FiscalPeriodDbArchiveStatus = "active" | "archived" | "purged";

export type EntryDbSide = "debit" | "credit";

export type MasterBookAccountDbAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "expense";

export type EntryLineDbRecord = {
  id: string;
  side: EntryDbSide;
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type OpeningBalanceLineDbRecord = {
  id: string;
  accountId: string;
  amount: number;
};

export type OpeningJournalDbRecord = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: EntryLineDbRecord[];
};

export type FiscalPeriodOpeningDbRecord = {
  openingBalanceLines: OpeningBalanceLineDbRecord[];
  openingJournals: OpeningJournalDbRecord[];
};

export type FiscalPeriodDbRecord = {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodDbPhase;
  archiveStatus: FiscalPeriodDbArchiveStatus;
  archivedAt: string | null;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening: FiscalPeriodOpeningDbRecord;
  createdAt: string;
  updatedAt: string;
};

export type FiscalPeriodDbCreateInput = {
  name: string;
  startDate: string;
  endDate: string;
};

export type FiscalPeriodNextDbCreateInput = {
  sourceFiscalPeriodId: string;
  name: string;
  startDate: string;
  endDate: string;
  carryBalances: boolean;
  reversalEntryIds: string[];
  carryFixedAssets: boolean;
};

export type FiscalPeriodDbPatchInput = {
  name?: string;
  startDate?: string;
  endDate?: string;
  openingBalancesCompleted?: boolean;
  documentsReceivedCompleted?: boolean;
  opening?: FiscalPeriodOpeningDbRecord;
};

export type EntryLineDbInput = {
  side: EntryDbSide;
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type EntryDbRecord = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryLineDbRecord[];
  createdAt: string;
  updatedAt: string;
};

export type EntryDbUpsertInput = {
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryLineDbInput[];
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
  disposalDate: string | null;
  disposalPrice: number | null;
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

export type FixedAssetDbPatchInput = {
  name?: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
  usefulLife?: number;
  depreciationMethod?: "straight_line";
  businessRate?: number;
  status?: FixedAssetDbStatus;
  disposalDate?: string | null;
  disposalPrice?: number | null;
  bookAccountId?: string;
};

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
  accountType: MasterBookAccountDbAccountType;
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

export type FixedAssetDbImportInput = {
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: FixedAssetDbStatus;
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
};

export type FiscalPeriodDbImportInput = {
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodDbPhase;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening: FiscalPeriodOpeningDbRecord;
};

export type ClosingMarkerDbRecord = {
  fiscalPeriodId: string;
  year: number;
};

export type ClosingMarkerDbImportInput = {
  year: number;
};

export type FiscalPeriodArchiveDbImportInput = {
  fiscalPeriod: FiscalPeriodDbImportInput;
  entries: EntryDbUpsertInput[];
  fixedAssets: FixedAssetDbImportInput[];
  preClosings: ClosingMarkerDbImportInput[];
  closings: ClosingMarkerDbImportInput[];
};

export type DbSnapshot = {
  fiscalPeriods: FiscalPeriodDbRecord[];
  entries: EntryDbRecord[];
  fixedAssets: FixedAssetDbRecord[];
  preClosings: ClosingMarkerDbRecord[];
  closings: ClosingMarkerDbRecord[];
};
