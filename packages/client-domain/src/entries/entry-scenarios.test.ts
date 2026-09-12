import { describe, expect, it } from "vitest";

import {
  entryRecord,
  type EntryRecordOverrides,
} from "../../test-support/entry-record.js";
import type { FixedAsset } from "../assist/fixed-asset-data.js";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover.js";
import {
  computeExpenseContribution,
  computeRevenueContribution,
  type EntrySummaryRow,
} from "../steps/summary.js";
import {
  type EntryLine,
  type EntryRecord,
  recordToPreviewRows,
} from "./entry-record.js";
import {
  buildVirtualFixedAssetRows,
  buildVirtualOpeningCarryoverRows,
  materializeVirtualEntryRows,
} from "./virtual-entries.js";

describe("entry scenario rows", () => {
  it("keeps compound entries balanced while exposing each line to summaries", () => {
    const record = entry({
      lines: [
        {
          side: "debit",
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
        {
          side: "debit",
          accountName: "通信費",
          accountType: "expense",
          amount: "5,000",
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
          accountName: "普通預金",
          accountType: "asset",
          amount: "15,000",
          id: null,
          bookAccountId: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
      ],
    });

    expect(totalBySide(record.lines, "debit")).toBe(15_000);
    expect(totalBySide(record.lines, "credit")).toBe(15_000);

    const rows = recordToPreviewRows(record);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.debit)).toEqual(["消耗品費", "通信費"]);
    expect(plTotals(rows)).toEqual({
      revenue: 0,
      expenses: 15_000,
      profit: -15_000,
    });
  });

  it("uses each visual pair's line metadata", () => {
    const rows = recordToPreviewRows(
      entry({
        partner: "ヘッダー取引先",
        taxCategory: "ヘッダー税区分",
        businessCategory: "ヘッダー事業区分",
        lines: [
          {
            side: "debit",
            accountName: "消耗品費",
            accountType: "expense",
            amount: "60",
            partnerName: "仕入先A",
            taxCategoryName: "課税仕入 10%",
            businessCategoryName: "第5種",
            id: null,
            bookAccountId: null,
            taxCategoryId: null,
            businessCategoryId: null,
          },
          {
            side: "debit",
            accountName: "支払手数料",
            accountType: "expense",
            amount: "40",
            partnerName: "銀行B",
            taxCategoryName: "対象外",
            businessCategoryName: "対象外",
            id: null,
            bookAccountId: null,
            taxCategoryId: null,
            businessCategoryId: null,
          },
          {
            side: "credit",
            accountName: "普通預金",
            accountType: "asset",
            amount: "100",
            partnerName: "銀行B",
            taxCategoryName: "対象外",
            businessCategoryName: "対象外",
            id: null,
            bookAccountId: null,
            taxCategoryId: null,
            businessCategoryId: null,
          },
        ],
      }),
    );

    expect(rows[0]).toMatchObject({
      partner: "借: 仕入先A / 貸: 銀行B",
      taxCategory: "借: 課税仕入 10% / 貸: 対象外",
      businessCategory: "借: 第5種 / 貸: 対象外",
    });
    expect(rows[1]).toMatchObject({
      partner: "銀行B",
      taxCategory: "対象外",
      businessCategory: "対象外",
    });
  });

  it("books depreciation for active assets with month proration at period end", () => {
    const rows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: [
        fixedAsset({
          id: "full-year",
          name: "サーバー",
          acquisitionDate: "2025-01-01",
          acquisitionCost: 1_200_000,
          usefulLife: 5,
          businessRate: 1,
        }),
        fixedAsset({
          id: "mid-year",
          name: "モニター",
          acquisitionDate: "2026-04-10",
          acquisitionCost: 1_200_000,
          usefulLife: 5,
          businessRate: 1,
        }),
      ],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      yearMonth: "2026-12",
    });

    expect(
      rows.find((row) => row.description.includes("サーバー")),
    ).toMatchObject({
      date: "12/31",
      debit: "減価償却費",
      debitAmount: "240,000",
      credit: "工具器具備品",
      creditAmount: "240,000",
      businessRate: 1,
    });
    expect(
      rows.find((row) => row.description.includes("モニター")),
    ).toMatchObject({
      debit: "減価償却費",
      debitAmount: "179,999",
      creditAmount: "179,999",
    });
    expect(plTotals(rows)).toMatchObject({
      revenue: 0,
      expenses: 419_999,
      profit: -419_999,
    });
  });

  it("books depreciation up to disposal and a sale entry for a sold asset", () => {
    const rows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: [
        fixedAsset({
          id: "sold",
          name: "撮影機材",
          acquisitionDate: "2024-01-01",
          acquisitionCost: 1_200_000,
          usefulLife: 5,
          businessRate: 1,
          status: "売却済",
          disposalDate: "2026-06-15",
          disposalPrice: 700_000,
        }),
      ],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      yearMonth: "2026-06",
    });

    // (1) 期首〜処分日（1〜6月）の当期償却費。
    expect(
      rows.filter((row) => row.recordId === "virtual-fixed-asset-sold"),
    ).toEqual([
      expect.objectContaining({
        date: "06/15",
        debit: "減価償却費",
        debitAmount: "120,000",
        credit: "工具器具備品",
        creditAmount: "120,000",
      }),
    ]);
    // (2) 処分日簿価 600,001 で資産を除き、売却益 99,999 を計上。
    expect(
      rows.filter((row) => row.recordId === "virtual-fixed-asset-sale-sold"),
    ).toEqual([
      expect.objectContaining({
        debit: "普通預金",
        debitAmount: "700,000",
        credit: "工具器具備品",
        creditAmount: "600,001",
        lineIndex: 0,
        lineCount: 2,
      }),
      expect.objectContaining({
        debit: "",
        credit: "固定資産売却益",
        creditAmount: "99,999",
        lineIndex: 1,
        lineCount: 2,
      }),
    ]);
  });

  it("books depreciation and a retirement loss for a discarded asset", () => {
    const rows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: [
        fixedAsset({
          id: "scrapped",
          name: "旧プリンター",
          acquisitionDate: "2024-01-01",
          acquisitionCost: 1_200_000,
          usefulLife: 5,
          businessRate: 1,
          status: "廃棄済",
          disposalDate: "2026-06-15",
        }),
      ],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      yearMonth: "2026-06",
    });

    expect(
      rows.filter((row) => row.recordId === "virtual-fixed-asset-scrapped"),
    ).toEqual([
      expect.objectContaining({
        debit: "減価償却費",
        debitAmount: "120,000",
        creditAmount: "120,000",
      }),
    ]);
    // 残存簿価 600,001 を固定資産除却損として計上。
    expect(
      rows.filter(
        (row) => row.recordId === "virtual-fixed-asset-retire-scrapped",
      ),
    ).toEqual([
      expect.objectContaining({
        debit: "固定資産除却損",
        debitAmount: "600,001",
        credit: "工具器具備品",
        creditAmount: "600,001",
      }),
    ]);
    expect(plTotals(rows)).toMatchObject({
      revenue: 0,
      expenses: 720_001,
      profit: -720_001,
    });
  });

  it("materializes the sale entry into an idempotent compound entry", () => {
    const rows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: [
        fixedAsset({
          id: "sold",
          name: "撮影機材",
          acquisitionDate: "2024-01-01",
          acquisitionCost: 1_200_000,
          usefulLife: 5,
          businessRate: 1,
          status: "売却済",
          disposalDate: "2026-06-15",
          disposalPrice: 700_000,
        }),
      ],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      yearMonth: "2026-06",
    });

    const entries = materializeVirtualEntryRows({
      fiscalPeriodId: "fp-2026",
      yearMonth: "2026-06",
      rows,
    });

    expect(
      entries.find(
        (entry) => entry.localId === "virtual:virtual-fixed-asset-sale-sold",
      ),
    ).toMatchObject({
      fiscalPeriodId: "fp-2026",
      date: "2026-06-15",
      description: "撮影機材の売却",
      lines: [
        {
          side: "debit",
          accountName: "普通預金",
          accountType: "asset",
          amount: "700,000",
        },
        {
          side: "credit",
          accountName: "工具器具備品",
          accountType: "asset",
          amount: "600,001",
        },
        {
          side: "credit",
          accountName: "固定資産売却益",
          accountType: "revenue",
          amount: "99,999",
        },
      ],
    });
  });

  it("turns opening carryover records into next-period reversal rows", () => {
    const rows = buildVirtualOpeningCarryoverRows({
      fiscalPeriodId: "fp-2027",
      yearMonth: "2027-01",
      records: [
        openingCarryover({
          id: "carryover-accrued-cost",
          fiscalPeriodId: "fp-2027",
          date: "2027-01-01",
          description: "前年末未払仕入の再振替",
          lines: [
            {
              id: "carryover-accrued-cost-d",
              side: "debit",
              accountName: "未払金",
              accountType: "liability",
              amount: "210,000",
              bookAccountId: null,
              partnerName: "",
              taxCategoryId: null,
              taxCategoryName: "対象外",
              businessCategoryId: null,
              businessCategoryName: "",
            },
            {
              id: "carryover-accrued-cost-c",
              side: "credit",
              accountName: "仕入金額",
              accountType: "cost_of_sales",
              amount: "210,000",
              bookAccountId: null,
              partnerName: "",
              taxCategoryId: null,
              taxCategoryName: "対象外",
              businessCategoryId: null,
              businessCategoryName: "",
            },
          ],
        }),
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        date: "01/01",
        debit: "未払金",
        debitAmount: "210,000",
        credit: "仕入金額",
        creditAmount: "210,000",
        description: "前年末未払仕入の再振替",
        virtual: {
          id: "opening-carryover-carryover-accrued-cost",
          kind: "opening_carryover",
          sourceId: "carryover-accrued-cost",
          label: "再振替",
          assistHref:
            "/assist/opening-carryover?carryover=carryover-accrued-cost",
        },
      }),
    ]);

    expect(
      materializeVirtualEntryRows({
        fiscalPeriodId: "fp-2027",
        yearMonth: "2027-01",
        rows,
      }),
    ).toEqual([
      expect.objectContaining({
        fiscalPeriodId: "fp-2027",
        date: "2027-01-01",
        description: "前年末未払仕入の再振替",
        localId: "virtual:virtual-opening-carryover-carryover-accrued-cost",
        lines: [
          {
            side: "debit",
            accountName: "未払金",
            accountType: "liability",
            amount: "210,000",
            id: null,
            bookAccountId: null,
            partnerName: "",
            taxCategoryId: null,
            taxCategoryName: "対象外",
            businessCategoryId: null,
            businessCategoryName: "",
          },
          {
            side: "credit",
            accountName: "仕入金額",
            accountType: "cost_of_sales",
            amount: "210,000",
            id: null,
            bookAccountId: null,
            partnerName: "",
            taxCategoryId: null,
            taxCategoryName: "対象外",
            businessCategoryId: null,
            businessCategoryName: "",
          },
        ],
      }),
    ]);
  });
});

function plTotals(rows: ReturnType<typeof recordToPreviewRows>): {
  revenue: number;
  expenses: number;
  profit: number;
} {
  let revenue = 0;
  let expenses = 0;
  for (const source of rows) {
    const row: EntrySummaryRow = entryRecord(source);
    const rate = row.businessRate;
    revenue += computeRevenueContribution(row, rate);
    expenses += computeExpenseContribution(row, rate);
  }
  return { revenue, expenses, profit: revenue - expenses };
}

function fixedAsset(
  overrides: Partial<FixedAsset> & { id: string },
): FixedAsset {
  const base: FixedAsset = {
    id: overrides.id,
    name: "資産",
    accountName: "工具器具備品",
    bookAccountId: "acct_equipment",
    status: "償却中",
    fiscalPeriodId: "fp-2026",
    acquisitionDate: "2026-01-01",
    acquisitionCost: 1,
    usefulLife: 1,
    businessRate: 1,
    disposalDate: null,
    disposalPrice: null,
    depreciationStartLabel: "",
    remainingDepreciationLabel: "",
    depreciationProgress: 0,
    currentBookValue: 1,
  };
  return Object.assign(base, overrides);
}

function entry(overrides: EntryRecordOverrides): EntryRecord {
  return entryRecord(overrides, {
    id: "scenario-entry",
    fiscalPeriodId: "fp-2026",
    date: "2026-09-05",
    weekday: "土",
    debit: "消耗品費",
    debitType: "expense",
    debitAmount: "10,000",
    creditAmount: "15,000",
    description: "複合仕訳のテスト",
    taxCategory: "課税 10%",
  });
}

function openingCarryover(
  overrides: Partial<OpeningCarryoverRecord>,
): OpeningCarryoverRecord {
  const base: OpeningCarryoverRecord = {
    id: "carryover",
    fiscalPeriodId: "fp-2027",
    date: "2027-01-01",
    description: "再振替",
    businessRate: 1,
    lines: [],
  };
  return Object.assign(base, overrides);
}

function totalBySide(
  lines: EntryLine[],
  side: "debit" | "credit",
): number {
  return lines
    .filter((line) => line.side === side)
    .reduce((sum, line) => sum + Number(line.amount.replaceAll(",", "")), 0);
}
