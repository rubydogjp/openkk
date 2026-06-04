import { describe, expect, it } from "vitest";

import type { EntryRecord } from "../entries/entry-record";
import { buildOpeningCarryoverJournalsFromReversibleEntries } from "./next-fiscal-period";

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
