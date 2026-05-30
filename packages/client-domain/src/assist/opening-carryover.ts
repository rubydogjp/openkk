import type { EntryAccountVisualType } from "../entries/entries-types";

export type OpeningCarryoverRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  debit: string;
  debitType: EntryAccountVisualType;
  debitAmount: string;
  credit: string;
  creditType: EntryAccountVisualType;
  creditAmount: string;
  partner: string;
  taxCategory: string;
  businessCategory: string;
  businessRate: string;
  debitBookAccountId?: string;
  creditBookAccountId?: string;
};

export type OpeningCarryoverDraft = Omit<
  OpeningCarryoverRecord,
  "id" | "fiscalPeriodId"
>;
