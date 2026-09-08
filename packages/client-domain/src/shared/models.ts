import type { OpenkkUser } from "./user.js";

export type Session = {
  user: OpenkkUser;
};

export type FiscalPeriodPhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

export type FiscalPeriodArchiveStatus = "active" | "archived";

export type FiscalPeriod = {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodPhase;
  archiveStatus: FiscalPeriodArchiveStatus;
  archiveDataAvailable: boolean;
  archivedAt: string | null;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  openingDebitTotal: number;
  openingCreditTotal: number;
  createdAt: string;
  updatedAt: string;
  opening: FiscalPeriodOpening | null;
};

export type FiscalPeriodOpeningBalanceLine = {
  id: string;
  accountId: string;
  amount: number;
};

export type FiscalPeriodOpeningJournalLine = {
  id: string;
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type FiscalPeriodOpeningJournal = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: FiscalPeriodOpeningJournalLine[];
};

export type FiscalPeriodOpening = {
  id: string;
  userId: string;
  fiscalPeriodId: string;
  createdAt: string;
  updatedAt: string;
  openingBalanceLines: FiscalPeriodOpeningBalanceLine[];
  openingJournals: FiscalPeriodOpeningJournal[];
};
