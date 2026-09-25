import type { OpenkkUser } from "./user.js";

export type Session = {
  user: OpenkkUser;
};

export type FiscalPeriodPhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

export type FiscalPeriodArchiveStatus = "active" | "archived" | "purged";

export type FiscalPeriod = {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodPhase;
  archiveStatus: FiscalPeriodArchiveStatus;
  archivedAt: string | null;
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
