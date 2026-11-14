import type { OpenkkUser } from "./user.js";

export type Session = {
  user: OpenkkUser;
};

export type FiscalPeriodPhase =
  "pre_opening" | "journalizing" | "pre_closing" | "post_closing";

export type FiscalPeriodArchiveStatus = "active" | "purged";

export type FiscalPeriod = {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodPhase;
  archiveStatus: FiscalPeriodArchiveStatus;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  opening: FiscalPeriodOpening;
};

export type OpeningBalanceLine = {
  id: string;
  accountId: string;
  amount: number;
};

export type OpeningJournalLine = {
  id: string;
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type OpeningJournal = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: OpeningJournalLine[];
};

export type FiscalPeriodOpening = {
  balanceLines: OpeningBalanceLine[];
  journals: OpeningJournal[];
};

export function fiscalPeriodPhaseLabel(phase: FiscalPeriodPhase): string {
  if (phase === "pre_opening") return "開始前";
  if (phase === "journalizing") return "記帳中";
  if (phase === "pre_closing") return "仮締め済み";
  return "決算後";
}
