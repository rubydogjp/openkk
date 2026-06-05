export type Session = {
  userId: string;
  displayName: string;
  email: string;
};

export type FiscalPeriodStage =
  | "pre_opening"
  | "journalizing"
  | "post_closing";

export type FiscalPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  stage: FiscalPeriodStage;
  archived: boolean;
  provisionalClosingCompleted: boolean;
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
    carryoverJournals: Array<{
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
