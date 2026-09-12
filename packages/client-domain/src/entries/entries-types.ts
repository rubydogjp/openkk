import type { BookAccountType } from "./book-account.js";

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
  recordId: string;
  lineIndex: number;
  lineCount: number;
  isFirstOfRecord: boolean;
  date: string;
  weekday: string;
  debit: string;
  debitType: BookAccountType;
  debitAmount: string;
  debitBookAccountId: string | null;
  debitPartnerName: string | null;
  debitTaxCategoryId: string | null;
  debitBusinessCategoryId: string | null;
  credit: string;
  creditType: BookAccountType;
  creditAmount: string;
  creditBookAccountId: string | null;
  creditPartnerName: string | null;
  creditTaxCategoryId: string | null;
  creditBusinessCategoryId: string | null;
  description: string;
  partner: string;
  businessRate: number;
  taxCategory: string;
  businessCategory: string;
  virtual: VirtualEntrySource | null;
};
