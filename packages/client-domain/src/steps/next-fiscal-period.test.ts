import { describe, expect, it } from "vitest";

import type { EntryRecord } from "../entries/entry-record";
import type { FiscalPeriod } from "../shared/models";
import {
  buildNextFiscalPeriodSuggestion,
  buildOpeningCarryoverJournalsFromReversibleEntries,
  findSuggestedNextFiscalPeriod,
} from "./next-fiscal-period";

describe("buildNextFiscalPeriodSuggestion", () => {
  it("suggests the next calendar year for a calendar-year period", () => {
    expect(
      buildNextFiscalPeriodSuggestion({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toEqual({
      name: "2027年分",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
  });

  it("preserves non-calendar fiscal period month and day boundaries", () => {
    expect(
      buildNextFiscalPeriodSuggestion({
        startDate: "2025-04-01",
        endDate: "2026-03-31",
      }),
    ).toEqual({
      name: "2027年分",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
  });

  it("clamps leap-day boundaries to the target year's month end", () => {
    expect(
      buildNextFiscalPeriodSuggestion({
        startDate: "2024-02-29",
        endDate: "2025-02-28",
      }),
    ).toEqual({
      name: "2026年分",
      startDate: "2025-02-28",
      endDate: "2026-02-28",
    });
  });
});

describe("findSuggestedNextFiscalPeriod", () => {
  it("finds the fiscal period that exactly matches the suggested boundaries", () => {
    const current = period({
      id: "fp-2026",
      startDate: "2025-04-01",
      endDate: "2026-03-31",
    });
    const matching = period({
      id: "fp-2027",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });

    expect(
      findSuggestedNextFiscalPeriod([current, matching], current, {
        name: "2027年分",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
      }),
    ).toBe(matching);
  });

  it("does not match an unrelated period only because the end year is next year", () => {
    const current = period({
      id: "fp-2026",
      startDate: "2025-04-01",
      endDate: "2026-03-31",
    });
    const unrelated = period({
      id: "fp-other",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
    });

    expect(
      findSuggestedNextFiscalPeriod([current, unrelated], current, {
        name: "2027年分",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
      }),
    ).toBeNull();
  });
});

describe("buildOpeningCarryoverJournalsFromReversibleEntries", () => {
  it("creates next-period reversals for accrued liability expense entries", () => {
    const journals = buildOpeningCarryoverJournalsFromReversibleEntries({
      nextFiscalPeriodId: "fp-2027",
      nextStartDate: "2027-01-01",
      entries: [
        entry({
          id: "accrued-purchase",
          debit: "仕入",
          debitType: "cost_of_sales",
          debitAmount: "168,000",
          credit: "未払金",
          creditType: "liability",
          creditAmount: "168,000",
        }),
      ],
    });

    expect(journals).toHaveLength(1);
    expect(journals[0]).toMatchObject({
      date: "2027-01-01",
      description: "再振替: test",
      lines: [
        { side: "debit", bookAccountId: "acct_accrued_expense", amount: 168_000 },
        { side: "credit", bookAccountId: "acct_purchases", amount: 168_000 },
      ],
    });
  });

  it("splits compound accrual entries into one reversal per profit/loss line", () => {
    const journals = buildOpeningCarryoverJournalsFromReversibleEntries({
      nextFiscalPeriodId: "fp-2027",
      nextStartDate: "2027-01-01",
      entries: [
        entry({
          id: "compound",
          lines: [
            {
              side: "debit",
              accountName: "仕入",
              accountType: "cost_of_sales",
              amount: "168,000",
            },
            {
              side: "debit",
              accountName: "荷造運賃",
              accountType: "expense",
              amount: "42,000",
            },
            {
              side: "credit",
              accountName: "未払金",
              accountType: "liability",
              amount: "210,000",
            },
          ],
        }),
      ],
    });

    expect(journals).toHaveLength(2);
    expect(journals.map((journal) => journal.lines[0]?.amount)).toEqual([
      168_000,
      42_000,
    ]);
    expect(journals.map((journal) => journal.lines[1]?.side)).toEqual([
      "credit",
      "credit",
    ]);
  });

  it("matches multiple reversible balance lines without over-generating reversals", () => {
    const journals = buildOpeningCarryoverJournalsFromReversibleEntries({
      nextFiscalPeriodId: "fp-2027",
      nextStartDate: "2027-01-01",
      entries: [
        entry({
          id: "multi-balance",
          lines: [
            {
              side: "debit",
              accountName: "消耗品費",
              accountType: "expense",
              amount: "100,000",
            },
            {
              side: "credit",
              accountName: "未払金",
              accountType: "liability",
              amount: "60,000",
            },
            {
              side: "credit",
              accountName: "未払費用",
              accountType: "liability",
              amount: "40,000",
            },
          ],
        }),
      ],
    });

    expect(journals).toHaveLength(2);
    expect(journals.map((journal) => journal.lines[0]?.amount)).toEqual([
      60_000,
      40_000,
    ]);
    expect(journals.map((journal) => journal.lines[1]?.amount)).toEqual([
      60_000,
      40_000,
    ]);
  });

  it("does not reverse partially matched entries", () => {
    const journals = buildOpeningCarryoverJournalsFromReversibleEntries({
      nextFiscalPeriodId: "fp-2027",
      nextStartDate: "2027-01-01",
      entries: [
        entry({
          id: "mismatch",
          lines: [
            {
              side: "debit",
              accountName: "消耗品費",
              accountType: "expense",
              amount: "100,000",
            },
            {
              side: "credit",
              accountName: "未払金",
              accountType: "liability",
              amount: "90,000",
            },
          ],
        }),
      ],
    });

    expect(journals).toEqual([]);
  });

  it("does not reverse ordinary cash settlement or fixed asset purchase entries", () => {
    const journals = buildOpeningCarryoverJournalsFromReversibleEntries({
      nextFiscalPeriodId: "fp-2027",
      nextStartDate: "2027-01-01",
      entries: [
        entry({
          id: "cash-sale",
          debit: "普通預金",
          debitType: "asset",
          credit: "売上",
          creditType: "revenue",
        }),
        entry({
          id: "fixed-asset",
          debit: "工具器具備品",
          debitType: "asset",
          credit: "普通預金",
          creditType: "asset",
        }),
      ],
    });

    expect(journals).toEqual([]);
  });
});

function entry(overrides: Partial<EntryRecord>): EntryRecord {
  return {
    id: "entry-1",
    fiscalPeriodId: "fp-2026",
    date: "2026-12-31",
    weekday: "木",
    debit: "消耗品費",
    debitType: "expense",
    debitAmount: "10,000",
    credit: "普通預金",
    creditType: "asset",
    creditAmount: "10,000",
    description: "test",
    partner: "",
    businessRate: "",
    taxCategory: "対象外",
    businessCategory: "対象外",
    ...overrides,
  };
}

function period(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    id: "fp-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "journalizing",
    provisionalClosingCompleted: false,
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    openingDebitTotal: 0,
    openingCreditTotal: 0,
    ...overrides,
  };
}
