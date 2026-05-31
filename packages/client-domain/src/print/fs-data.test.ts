import { describe, expect, it } from "vitest";

import type { EntryRecord } from "../entries/entry-record";
import { computeFsAggregate } from "./fs-data";

describe("computeFsAggregate", () => {
  it("builds profit-and-loss and balance-sheet values from real entries", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { accountId: "a:普通預金", amount: 50_000 },
        { accountId: "l:借入金", amount: 20_000 },
        { accountId: "l:元入金", amount: 30_000 },
      ],
      entries: [
        entry({
          debit: "普通預金",
          debitType: "asset",
          debitAmount: "100,000",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "100,000",
        }),
        entry({
          debit: "仕入",
          debitType: "cost_of_sales",
          debitAmount: "30,000",
          credit: "普通預金",
          creditType: "asset",
          creditAmount: "30,000",
        }),
        entry({
          businessRate: "50",
          debit: "消耗品費",
          debitType: "expense",
          debitAmount: "20,000",
          credit: "普通預金",
          creditType: "asset",
          creditAmount: "20,000",
        }),
      ],
    });

    expect(aggregate.amounts[1]).toBe(100_000);
    expect(aggregate.amounts[6]).toBe(30_000);
    expect(aggregate.amounts[7]).toBe(70_000);
    expect(aggregate.amounts[17]).toBe(10_000);
    expect(aggregate.amounts[32]).toBe(10_000);
    expect(aggregate.amounts[33]).toBe(60_000);
    expect(aggregate.amounts[43]).toBe(60_000);

    const bankRow = aggregate.bsRows.find((row) => row.assetLabel === "その他の預金");
    expect(bankRow?.assetOpening).toBe(50_000);
    expect(bankRow?.assetClosing).toBe(110_000);

    const totalRow = aggregate.bsRows.at(-1);
    expect(totalRow).toMatchObject({
      assetLabel: "合計",
      assetOpening: 50_000,
      assetClosing: 110_000,
      liabilityLabel: "合計",
      liabilityOpening: 50_000,
      liabilityClosing: 110_000,
    });
  });

  it("includes every line in a compound journal entry", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { accountId: "a:普通預金", amount: 300_000 },
        { accountId: "l:元入金", amount: 300_000 },
      ],
      entries: [
        entry({
          id: "compound-purchase",
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
          debit: "仕入",
          debitType: "cost_of_sales",
          debitAmount: "168,000",
          credit: "未払金",
          creditType: "liability",
          creditAmount: "210,000",
        }),
      ],
    });

    expect(aggregate.amounts[3]).toBe(168_000);
    expect(aggregate.amounts[6]).toBe(168_000);
    expect(aggregate.amounts[9]).toBe(42_000);
    expect(aggregate.amounts[32]).toBe(42_000);
    expect(aggregate.amounts[33]).toBe(-210_000);

    const payableRow = aggregate.bsRows.find((row) => row.liabilityLabel === "未払金");
    expect(payableRow?.liabilityClosing).toBe(210_000);

    const totalRow = aggregate.bsRows.at(-1);
    expect(totalRow?.assetClosing).toBe(300_000);
    expect(totalRow?.liabilityClosing).toBe(300_000);
  });
});

function entry(overrides: Partial<EntryRecord>): EntryRecord {
  return {
    id: "entry-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    weekday: "木",
    debit: "普通預金",
    debitType: "asset",
    debitAmount: "0",
    credit: "普通預金",
    creditType: "asset",
    creditAmount: "0",
    description: "test",
    partner: "",
    businessRate: "",
    taxCategory: "対象外",
    businessCategory: "",
    ...overrides,
  };
}
