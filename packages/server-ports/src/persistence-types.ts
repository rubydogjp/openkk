export type FiscalPeriodDbStage =
  | "pre_opening"
  | "journalizing"
  | "post_closing";

export type OpeningBalanceLineDbRecord = {
  id: string;
  accountId: string;
  amount: number;
};

export type CarryoverJournalLineDbRecord = {
  id: string;
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryName: string;
  businessCategoryName: string;
};

export type CarryoverJournalDbRecord = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: CarryoverJournalLineDbRecord[];
};

export type FiscalPeriodOpeningDbRecord = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  openingBalanceLines?: OpeningBalanceLineDbRecord[];
  carryoverJournals?: CarryoverJournalDbRecord[];
};

export type FiscalPeriodDbRecord = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  stage: FiscalPeriodDbStage;
  archived: boolean;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening?: FiscalPeriodOpeningDbRecord | null;
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
  stage: FiscalPeriodDbStage;
  archived: boolean;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening: Required<FiscalPeriodOpeningDbRecord>;
}>;

export type EntryDbLine = {
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryName: string;
  businessCategoryName: string;
};

export type EntryDbRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  localId: string;
  businessRate: number;
  lines: EntryDbLine[];
};

export type EntryDbUpsertInput = {
  date: string;
  description: string;
  localId?: string;
  businessRate: number;
  lines: EntryDbLine[];
};

export type FixedAssetDbStatus = "active" | "sold" | "disposed" | "retired";

export type FixedAssetDbRecord = {
  id: string;
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
  Omit<FixedAssetDbRecord, "id" | "fiscalPeriodId">
>;

export type ClosingDbRecord = {
  isProvisional: boolean;
};

export type MasterBookAccountDbRecord = {
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

export type MasterTaxCategoryDbRecord = {
  id: string;
  name: string;
};

export type MasterBusinessCategoryDbRecord = {
  id: string;
  name: string;
};

export type FiscalPeriodArchiveDbImportInput = {
  fiscalPeriod: {
    name: string;
    startDate: string;
    endDate: string;
    stage: FiscalPeriodDbStage;
    archived: true;
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
  closings: Array<{ year: number; isProvisional: boolean }>;
};
