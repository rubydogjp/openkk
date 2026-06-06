import { describe, expect, it } from "vitest";

import type { EntryRecord } from "../entries/entry-record";
import {
  buildOpeningBalanceLinesFromClosingBsRows,
  computeFsAggregate,
} from "./fs-data";

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

    const bankRow = aggregate.bsRows.find(
      (row) => row.assetLabel === "その他の預金",
    );
    expect(bankRow?.assetOpening).toBe(50_000);
    expect(bankRow?.assetClosing).toBe(100_000);

    const withdrawalRow = aggregate.bsRows.find(
      (row) => row.assetLabel === "事業主貸",
    );
    expect(withdrawalRow?.assetClosing).toBe(10_000);

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

    const payableRow = aggregate.bsRows.find(
      (row) => row.liabilityLabel === "未払金",
    );
    expect(payableRow?.liabilityClosing).toBe(210_000);

    const totalRow = aggregate.bsRows.at(-1);
    expect(totalRow?.assetClosing).toBe(300_000);
    expect(totalRow?.liabilityClosing).toBe(300_000);
  });

  it("fills write-in slots with unnamed expenses and folds overflow into 雑費", () => {
    const expenseEntry = (name: string, amount: string): EntryRecord =>
      entry({
        debit: name,
        debitType: "expense",
        debitAmount: amount,
        credit: "普通預金",
        creditType: "asset",
        creditAmount: amount,
      });
    const aggregate = computeFsAggregate({
      openingBalanceLines: [],
      entries: [
        expenseEntry("会議費", "6,000"), // 名前付き行(26)へ
        expenseEntry("新聞図書費", "5,000"),
        expenseEntry("支払手数料", "4,000"),
        expenseEntry("諸会費", "3,000"),
        expenseEntry("研究開発費", "2,000"),
        expenseEntry("寄付金", "1,000"), // スロット超過 → 雑費へ
        expenseEntry("雑費", "500"),
      ],
    });

    // 会議費は専用行(26)に出る（旧実装ではマッピング漏れで null だった）。
    expect(aggregate.amounts[26]).toBe(6_000);
    // 任意経費は金額降順で空欄スロット(27〜30)へ。
    expect(aggregate.expenseWriteIns).toEqual([
      { label: "新聞図書費", amount: 5_000 },
      { label: "支払手数料", amount: 4_000 },
      { label: "諸会費", amount: 3_000 },
      { label: "研究開発費", amount: 2_000 },
    ]);
    expect(aggregate.amounts[27]).toBe(5_000);
    expect(aggregate.amounts[30]).toBe(2_000);
    // スロット超過分(寄付金 1,000)は雑費(500)へ合算 → 1,500。
    expect(aggregate.amounts[31]).toBe(1_500);
    // 経費合計(32)は各行(26〜31)の和と一致する。
    expect(aggregate.amounts[32]).toBe(21_500);
    expect(
      (aggregate.amounts[26] ?? 0) +
        (aggregate.amounts[27] ?? 0) +
        (aggregate.amounts[28] ?? 0) +
        (aggregate.amounts[29] ?? 0) +
        (aggregate.amounts[30] ?? 0) +
        (aggregate.amounts[31] ?? 0),
    ).toBe(aggregate.amounts[32]);
  });

  it("builds next-period opening balance lines from closing BS rows", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [{ accountId: "a:普通預金", amount: 50_000 }],
      entries: [
        entry({
          debit: "普通預金",
          debitType: "asset",
          debitAmount: "100,000",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "100,000",
        }),
      ],
    });

    expect(buildOpeningBalanceLinesFromClosingBsRows(aggregate.bsRows)).toEqual(
      expect.arrayContaining([
        { accountId: "a:その他の預金", amount: 150_000 },
        { accountId: "l:元入金", amount: 100_000 },
      ]),
    );
    expect(
      buildOpeningBalanceLinesFromClosingBsRows(aggregate.bsRows),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "a:合計" }),
        expect.objectContaining({
          accountId: "l:青色申告特別控除前の所得金額",
        }),
      ]),
    );
  });

  it("carries forward a balanced opening even in a loss-making year", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { accountId: "a:現金", amount: 500_000 },
        { accountId: "l:元入金", amount: 500_000 },
      ],
      entries: [
        entry({
          debit: "通信費",
          debitType: "expense",
          debitAmount: "100,000",
          credit: "現金",
          creditType: "asset",
          creditAmount: "100,000",
        }),
      ],
    });

    const opening = buildOpeningBalanceLinesFromClosingBsRows(aggregate.bsRows);
    expect(opening).toEqual(
      expect.arrayContaining([
        { accountId: "a:現金", amount: 400_000 },
        { accountId: "l:元入金", amount: 400_000 },
      ]),
    );
    const assets = sumByPrefix(opening, "a:");
    const liabilitiesAndEquity = sumByPrefix(opening, "l:");
    expect(assets).toBe(liabilitiesAndEquity);
  });

  it("folds owner-draw / owner-deposit / profit into 元入金 on carry-forward", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { accountId: "a:現金", amount: 1_000_000 },
        { accountId: "l:元入金", amount: 1_000_000 },
      ],
      entries: [
        entry({
          debit: "事業主貸",
          debitType: "asset",
          debitAmount: "50,000",
          credit: "現金",
          creditType: "asset",
          creditAmount: "50,000",
        }),
        entry({
          debit: "現金",
          debitType: "asset",
          debitAmount: "30,000",
          credit: "事業主借",
          creditType: "liability",
          creditAmount: "30,000",
        }),
        entry({
          debit: "現金",
          debitType: "asset",
          debitAmount: "200,000",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "200,000",
        }),
      ],
    });

    const opening = buildOpeningBalanceLinesFromClosingBsRows(aggregate.bsRows);
    // 元入金(翌期) = 1,000,000 + 利益200,000 + 事業主借30,000 − 事業主貸50,000 = 1,180,000
    expect(opening).toEqual(
      expect.arrayContaining([
        { accountId: "a:現金", amount: 1_180_000 },
        { accountId: "l:元入金", amount: 1_180_000 },
      ]),
    );
    // 事業主貸/事業主借 は独立残高として繰り越さない。
    expect(opening.map((line) => line.accountId)).not.toContain("a:事業主貸");
    expect(opening.map((line) => line.accountId)).not.toContain("l:事業主借");
  });
});

function sumByPrefix(
  lines: Array<{ accountId: string; amount: number }>,
  prefix: string,
): number {
  return lines
    .filter((line) => line.accountId.startsWith(prefix))
    .reduce((total, line) => total + line.amount, 0);
}

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
