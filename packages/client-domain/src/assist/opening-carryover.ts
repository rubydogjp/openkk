import type { EntryLine } from "../entries/entry-record.js";
import type { BookAccountType } from "../entries/book-account.js";

export type OpeningCarryoverLine = {
  id: string;
  side: "debit" | "credit";
  accountName: string;
  accountType: BookAccountType;
  amount: string;
  bookAccountId: string | null;
  partnerName: string | null;
  taxCategoryId: string | null;
  taxCategoryName: string | null;
  businessCategoryId: string | null;
  businessCategoryName: string | null;
};

export type OpeningCarryoverRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  businessRate: number;
  lines: OpeningCarryoverLine[];
};

export type OpeningCarryoverDraft = {
  date: string;
  description: string;
  businessRateInput: string;
  businessRate: number | null;
  lines: EntryLine[];
};
