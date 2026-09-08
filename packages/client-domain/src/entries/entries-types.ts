export type EntryAccountVisualType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "expense";

export type VirtualEntrySourceKind =
  | "opening_carryover"
  | "fixed_asset"
  | "business_rate_transfer";

export type VirtualEntrySource = {
  id: string;
  kind: VirtualEntrySourceKind;
  sourceId: string;
  label: string;
  assistHref: string | null;
};

export type EntryPreviewRow = {
  recordId: string | null;
  lineIndex: number | null;
  lineCount: number | null;
  isFirstOfRecord: boolean | null;
  date: string;
  weekday: string;
  debit: string;
  debitType: EntryAccountVisualType;
  debitAmount: string;
  debitBookAccountId: string | null;
  debitPartnerName: string | null;
  debitTaxCategoryId: string | null;
  debitBusinessCategoryId: string | null;
  credit: string;
  creditType: EntryAccountVisualType;
  creditAmount: string;
  creditBookAccountId: string | null;
  creditPartnerName: string | null;
  creditTaxCategoryId: string | null;
  creditBusinessCategoryId: string | null;
  description: string;
  partner: string;
  businessRate: string;
  businessRateRatio: number | null;
  taxCategory: string;
  businessCategory: string;
  virtual: VirtualEntrySource | null;
};
