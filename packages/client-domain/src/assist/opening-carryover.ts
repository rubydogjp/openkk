import type { EntryLine } from "../entries/entry-record.js";
import type { EntryAccountVisualType } from "../entries/entries-types.js";

export type OpeningCarryoverLine = EntryLine & { id: string };

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
  businessRateRatio: number | null;
  debitBookAccountId: string | null;
  creditBookAccountId: string | null;
  lines: OpeningCarryoverLine[] | null;
};

export type OpeningCarryoverDraft = Omit<
  OpeningCarryoverRecord,
  "id" | "fiscalPeriodId"
>;
