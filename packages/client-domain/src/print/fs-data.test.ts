import { describe, expect, it } from "vitest";

import {
  entryRecord,
  type EntryRecordOverrides,
} from "../../test-support/entry-record.js";
import type { EntryRecord } from "../entries/entry-record.js";
import { computeFsAggregate } from "./fs-data.js";

describe("computeFsAggregate", () => {
  it("builds profit-and-loss and balance-sheet values from real entries", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { id: "a:普通預金", accountId: "a:普通預金", amount: 50_000 },
        { id: "l:借入金", accountId: "l:借入金", amount: 20_000 },
        { id: "l:元入金", accountId: "l:元入金", amount: 30_000 },
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
          debit: "消耗品費",
          debitType: "expense",
          debitAmount: "20,000",
          credit: "普通預金",
          creditType: "asset",
          creditAmount: "20,000",
        }),
        entry({
          id: "business-rate-transfer",
          lines: [
            {
              side: "debit",
              accountName: "事業主貸",
              accountType: "asset",
              amount: "10,000",
              id: null,
              bookAccountId: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
            {
              side: "credit",
              accountName: "消耗品費",
              accountType: "expense",
              amount: "10,000",
              id: null,
              bookAccountId: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
          ],
          debit: "事業主貸",
          debitType: "asset",
          debitAmount: "10,000",
          credit: "消耗品費",
          creditType: "expense",
          creditAmount: "10,000",
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

    expect(aggregate.summary).toEqual({
      revenue: 100_000,
      expenses: 40_000,
      profit: 60_000,
      assets: 110_000,
      liabilities: 20_000,
      equity: 90_000,
    });
    expect(aggregate.summary.assets).toBe(
      aggregate.summary.liabilities + aggregate.summary.equity,
    );
  });

  it("includes every line in a compound journal entry", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { id: "a:普通預金", accountId: "a:普通預金", amount: 300_000 },
        { id: "l:元入金", accountId: "l:元入金", amount: 300_000 },
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
              id: null,
              bookAccountId: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
            {
              side: "debit",
              accountName: "荷造運賃",
              accountType: "expense",
              amount: "42,000",
              id: null,
              bookAccountId: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
            {
              side: "credit",
              accountName: "未払金",
              accountType: "liability",
              amount: "210,000",
              id: null,
              bookAccountId: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
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

    expect(aggregate.amounts[26]).toBe(6_000);
    expect(aggregate.expenseWriteIns).toEqual([
      { label: "新聞図書費", amount: 5_000 },
      { label: "支払手数料", amount: 4_000 },
      { label: "諸会費", amount: 3_000 },
      { label: "研究開発費", amount: 2_000 },
    ]);
    expect(aggregate.amounts[27]).toBe(5_000);
    expect(aggregate.amounts[30]).toBe(2_000);
    expect(aggregate.amounts[31]).toBe(1_500);
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

  it("aggregates non-standard asset accounts beyond the slot count into その他 so the BS balances", () => {
    const assetEntry = (name: string, amount: string): EntryRecord =>
      entry({
        debit: name,
        debitType: "asset",
        debitAmount: amount,
        credit: "元入金",
        creditType: "equity",
        creditAmount: amount,
      });
    const aggregate = computeFsAggregate({
      openingBalanceLines: [],
      entries: [
        assetEntry("ソフトウェア", "70,000"),
        assetEntry("敷金", "60,000"),
        assetEntry("保証金", "50,000"),
        assetEntry("出資金", "40,000"),
        assetEntry("電話加入権", "30,000"),
        assetEntry("立替金", "20,000"), // スロット超過 → その他へ
        assetEntry("仮払金", "10,000"), // スロット超過 → その他へ
      ],
    });

    const otherRow = aggregate.bsRows.find(
      (row) => row.assetLabel === "その他",
    );
    expect(otherRow?.assetClosing).toBe(30_000);

    const displayedAssetClosing = aggregate.bsRows
      .filter((row) => row.assetLabel !== "合計")
      .reduce((total, row) => total + (row.assetClosing ?? 0), 0);
    const totalRow = aggregate.bsRows.at(-1);
    expect(totalRow?.assetClosing).toBe(280_000);
    expect(displayedAssetClosing).toBe(totalRow?.assetClosing);
  });

  it("displays non-standard liability accounts", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [],
      entries: [
        entry({
          debit: "現金",
          debitType: "asset",
          debitAmount: "100,000",
          credit: "未払費用",
          creditType: "liability",
          creditAmount: "100,000",
        }),
      ],
    });

    expect(
      aggregate.bsRows.find((row) => row.liabilityLabel === "未払費用"),
    ).toMatchObject({ liabilityClosing: 100_000 });
  });

  it("folds liability write-in overflow into その他 without losing totals", () => {
    const entries = Array.from({ length: 14 }, (_, index) =>
      entry({
        id: `liability-${index + 1}`,
        debit: "現金",
        debitType: "asset",
        debitAmount: "1,000",
        credit: `任意負債${index + 1}`,
        creditType: "liability",
        creditAmount: "1,000",
      }),
    );
    const aggregate = computeFsAggregate({
      openingBalanceLines: [],
      entries,
    });
    const displayedLiabilities = aggregate.bsRows
      .filter((row) => row.liabilityLabel !== "合計")
      .reduce((sum, row) => sum + (row.liabilityClosing ?? 0), 0);

    expect(
      aggregate.bsRows.find((row) => row.liabilityLabel === "その他")
        ?.liabilityClosing,
    ).toBe(2_000);
    expect(displayedLiabilities).toBe(14_000);
    expect(aggregate.bsRows.at(-1)?.liabilityClosing).toBe(14_000);
  });

  it("shows contrary asset balances on the liability side", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { id: "a:現金", accountId: "a:現金", amount: 100_000 },
        { id: "l:借入金", accountId: "l:借入金", amount: 100_000 },
      ],
      entries: [
        entry({
          debit: "通信費",
          debitType: "expense",
          debitAmount: "150,000",
          credit: "現金",
          creditType: "asset",
          creditAmount: "150,000",
        }),
      ],
    });

    expect(
      aggregate.bsRows.find((row) => row.liabilityLabel === "現金"),
    ).toMatchObject({ liabilityClosing: 50_000 });
  });

  it("routes 専従者給与 and 貸倒引当金 繰入/戻入 to rows 34/37/38/39/42", () => {
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
      openingBalanceLines: [{ id: "a:普通預金", accountId: "a:普通預金", amount: 1_000_000 }],
      entries: [
        entry({
          debit: "普通預金",
          debitType: "asset",
          debitAmount: "500,000",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "500,000",
        }),
        entry({
          debit: "仕入",
          debitType: "cost_of_sales",
          debitAmount: "100,000",
          credit: "普通預金",
          creditType: "asset",
          creditAmount: "100,000",
        }),
        expenseEntry("通信費", "10,000"),
        expenseEntry("専従者給与", "120,000"),
        entry({
          debit: "貸倒引当金繰入",
          debitType: "expense",
          debitAmount: "30,000",
          credit: "貸倒引当金",
          creditType: "asset",
          creditAmount: "30,000",
        }),
        entry({
          debit: "貸倒引当金",
          debitType: "asset",
          debitAmount: "20,000",
          credit: "貸倒引当金戻入",
          creditType: "revenue",
          creditAmount: "20,000",
        }),
      ],
    });

    expect(aggregate.amounts[1]).toBe(500_000);
    expect(aggregate.amounts[7]).toBe(400_000);
    expect(aggregate.amounts[12]).toBe(10_000);
    expect(aggregate.amounts[32]).toBe(10_000);
    expect(aggregate.amounts[33]).toBe(390_000);
    expect(aggregate.expenseWriteIns).toEqual([]);
    expect(aggregate.amounts[31]).toBeNull();
    expect(aggregate.amounts[34]).toBe(20_000);
    expect(aggregate.amounts[37]).toBe(20_000);
    expect(aggregate.amounts[38]).toBe(120_000);
    expect(aggregate.amounts[39]).toBe(30_000);
    expect(aggregate.amounts[42]).toBe(150_000);
    expect(aggregate.amounts[43]).toBe(260_000);
    expect(aggregate.amounts[43]).toBe(
      (aggregate.amounts[33] ?? 0) +
        (aggregate.amounts[37] ?? 0) -
        (aggregate.amounts[42] ?? 0),
    );
  });

  it("shows 貸倒引当金 as a contra-asset on the credit side in both columns", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { id: "a:普通預金", accountId: "a:普通預金", amount: 500_000 },
        { id: "l:元入金", accountId: "l:元入金", amount: 500_000 },
      ],
      entries: [
        entry({
          debit: "貸倒引当金繰入",
          debitType: "expense",
          debitAmount: "30,000",
          credit: "貸倒引当金",
          creditType: "asset",
          creditAmount: "30,000",
        }),
      ],
    });

    const allowanceRow = aggregate.bsRows.find(
      (row) => row.liabilityLabel === "貸倒引当金",
    );
    expect(allowanceRow?.liabilityClosing).toBe(30_000);
    expect(
      aggregate.bsRows.some((row) => row.assetLabel === "貸倒引当金"),
    ).toBe(false);
    expect(aggregate.amounts[39]).toBe(30_000);
    expect(aggregate.amounts[43]).toBe(-30_000);
    const totalRow = aggregate.bsRows.at(-1);
    expect(totalRow?.assetClosing).toBe(500_000);
    expect(totalRow?.liabilityClosing).toBe(500_000);

    const next = computeFsAggregate({
      openingBalanceLines: [
        { id: "a:普通預金", accountId: "a:普通預金", amount: 500_000 },
        { id: "l:元入金", accountId: "l:元入金", amount: 470_000 },
        { id: "l:貸倒引当金", accountId: "l:貸倒引当金", amount: 30_000 },
      ],
      entries: [],
    });
    const nextAllowanceRow = next.bsRows.find(
      (row) => row.liabilityLabel === "貸倒引当金",
    );
    expect(nextAllowanceRow?.liabilityOpening).toBe(30_000);
    expect(nextAllowanceRow?.liabilityClosing).toBe(30_000);
    expect(next.bsRows.at(-1)?.assetClosing).toBe(
      next.bsRows.at(-1)?.liabilityClosing,
    );
  });

  it("preserves a contrary debit balance of 貸倒引当金 on the asset side", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [
        { id: "a:普通預金", accountId: "a:普通預金", amount: 500_000 },
        { id: "l:元入金", accountId: "l:元入金", amount: 500_000 },
      ],
      entries: [
        entry({
          debit: "貸倒引当金",
          debitType: "asset",
          debitAmount: "20,000",
          credit: "普通預金",
          creditType: "asset",
          creditAmount: "20,000",
        }),
      ],
    });

    expect(
      aggregate.bsRows.find((row) => row.assetLabel === "貸倒引当金"),
    ).toMatchObject({ assetClosing: 20_000 });
  });

});

function entry(overrides: EntryRecordOverrides): EntryRecord {
  return entryRecord(overrides);
}
