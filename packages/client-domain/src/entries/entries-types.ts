export type EntryAccountVisualType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "expense";

export type VirtualEntrySourceKind = "opening_carryover" | "fixed_asset";

export type VirtualEntrySource = {
  id: string;
  kind: VirtualEntrySourceKind;
  sourceId: string;
  label: string;
  assistHref: string;
};

export type EntryPreviewRow = {
  recordId?: string;
  lineIndex?: number;
  lineCount?: number;
  isFirstOfRecord?: boolean;
  date: string;
  weekday: string;
  debit: string;
  debitType: EntryAccountVisualType;
  debitAmount: string;
  credit: string;
  creditType: EntryAccountVisualType;
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  taxCategory: string;
  businessCategory: string;
  virtual?: VirtualEntrySource;
};
