export type Session = {
  userId: string;
  displayName: string;
  email: string;
};

export type FiscalPeriodPhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

export type FiscalPeriodArchiveStatus = "active" | "archived";

export type FiscalPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodPhase;
  archiveStatus: FiscalPeriodArchiveStatus;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  openingDebitTotal: number;
  openingCreditTotal: number;
  opening?: {
    id: string;
    userId: string;
    fiscalPeriodId: string;
    openingBalanceLines: Array<{
      id: string;
      accountId: string;
      amount: number;
    }>;
    openingJournals: Array<{
      id: string;
      date: string;
      description: string;
      businessRate: number;
      lines: Array<{
        id: string;
        side: "debit" | "credit";
        bookAccountId: string;
        amount: number;
        partnerName: string;
        taxCategoryName: string;
        businessCategoryName: string;
      }>;
    }>;
  };
};
