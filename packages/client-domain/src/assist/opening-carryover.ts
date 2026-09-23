import type { EntryLine } from "../entries/entry-record.js";

export type OpeningCarryoverRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  businessRate: number;
  lines: EntryLine[];
};

export type OpeningCarryoverDraft = {
  date: string;
  description: string;
  businessRateInput: string;
  businessRate: number | null;
  lines: EntryLine[];
};
