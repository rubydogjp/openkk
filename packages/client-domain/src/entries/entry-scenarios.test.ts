import { describe, expect, it } from "vitest";

import type { FixedAssetPreviewItem } from "../assist/fixed-asset-data";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover";
import { computeFinancialSummary } from "../steps/summary";
import {
  type EntryRecord,
  getEntryLines,
  recordToPreviewRows,
} from "./entry-record";
import {
  buildVirtualFixedAssetRows,
  buildVirtualOpeningCarryoverRows,
  materializeVirtualEntryRows,
} from "./virtual-entries";

describe("entry scenario rows", () => {
  it("keeps compound entries balanced while exposing each line to summaries", () => {
    const record = entry({
      lines: [
        {
          side: "debit",
          accountName: "消耗品費",
          accountType: "expense",
          amount: "10,000",
        },
        {
          side: "debit",
          accountName: "通信費",
          accountType: "expense",
          amount: "5,000",
        },
        {
          side: "credit",
          accountName: "普通預金",
          accountType: "asset",
          amount: "15,000",
        },
      ],
    });

    expect(totalBySide(getEntryLines(record), "debit")).toBe(15_000);
    expect(totalBySide(getEntryLines(record), "credit")).toBe(15_000);

    const rows = recordToPreviewRows(record);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.debit)).toEqual(["消耗品費", "通信費"]);
    expect(computeFinancialSummary(rows)).toEqual({
      revenue: 0,
      expenses: 15_000,
      profit: -15_000,
    });
  });

  it("books depreciation for active assets with month proration at period end", () => {
    const rows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: [
        fixedAsset({
          id: "full-year",
          name: "サーバー",
          acquisitionDate: "2025-01-01", // 通年保有 → 1 年分
          purchase: "1,200,000",
          usefulLife: 5,
          businessRate: 1,
        }),
        fixedAsset({
          id: "mid-year",
          name: "モニター",
          acquisitionDate: "2026-04-10", // 当期取得 → 4〜12月の 9 ヶ月分
          purchase: "1,200,000",
          usefulLife: 5,
          businessRate: 1,
        }),
      ],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      yearMonth: "2026-12",
    });

    expect(rows.find((row) => row.description.includes("サーバー"))).toMatchObject({
      date: "12/31",
      debit: "減価償却費",
      debitAmount: "240,000",
      credit: "工具器具備品",
      creditAmount: "240,000",
      businessRate: "100",
    });
    expect(rows.find((row) => row.description.includes("モニター"))).toMatchObject({
      debit: "減価償却費",
      debitAmount: "179,999",
      creditAmount: "179,999",
    });
    expect(computeFinancialSummary(rows)).toMatchObject({
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
          purchase: "1,200,000",
          usefulLife: 5,
          businessRate: 1,
          status: "売却済",
          disposalDate: "2026-06-15",
          disposalPrice: "700,000",
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
          purchase: "1,200,000",
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
    expect(computeFinancialSummary(rows)).toMatchObject({
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
          purchase: "1,200,000",
          usefulLife: 5,
          businessRate: 1,
          status: "売却済",
          disposalDate: "2026-06-15",
          disposalPrice: "700,000",
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
        { side: "debit", accountName: "普通預金", accountType: "asset", amount: "700,000" },
        { side: "credit", accountName: "工具器具備品", accountType: "asset", amount: "600,001" },
        { side: "credit", accountName: "固定資産売却益", accountType: "revenue", amount: "99,999" },
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
          debit: "未払金",
          debitType: "liability",
          debitAmount: "210,000",
          credit: "仕入金額",
          creditType: "cost_of_sales",
          creditAmount: "210,000",
          description: "前年末未払仕入の再振替",
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
          assistHref: "/assist/opening-carryover?carryover=carryover-accrued-cost",
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
          },
          {
            side: "credit",
            accountName: "仕入金額",
            accountType: "cost_of_sales",
            amount: "210,000",
          },
        ],
      }),
    ]);
  });
});

function fixedAsset(
  overrides: Partial<FixedAssetPreviewItem> & { id: string },
): FixedAssetPreviewItem {
  return {
    name: "資産",
    account: "工具器具備品",
    period: "",
    remaining: "",
    progress: 0,
    current: "0",
    purchase: "0",
    status: "償却中",
    fiscalPeriodId: "fp-2026",
    ...overrides,
  };
}

function entry(overrides: Partial<EntryRecord>): EntryRecord {
  return {
    id: "scenario-entry",
    fiscalPeriodId: "fp-2026",
    date: "2026-09-05",
    weekday: "土",
    debit: "消耗品費",
    debitType: "expense",
    debitAmount: "10,000",
    credit: "普通預金",
    creditType: "asset",
    creditAmount: "15,000",
    description: "複合仕訳のテスト",
    partner: "",
    businessRate: "",
    taxCategory: "課税 10%",
    businessCategory: "",
    ...overrides,
  };
}

function openingCarryover(
  overrides: Partial<OpeningCarryoverRecord>,
): OpeningCarryoverRecord {
  return {
    id: "carryover",
    fiscalPeriodId: "fp-2027",
    date: "2027-01-01",
    description: "再振替",
    debit: "未払金",
    debitType: "liability",
    debitAmount: "0",
    credit: "仕入金額",
    creditType: "cost_of_sales",
    creditAmount: "0",
    partner: "",
    taxCategory: "対象外",
    businessCategory: "",
    businessRate: "",
    ...overrides,
  };
}

function totalBySide(
  lines: ReturnType<typeof getEntryLines>,
  side: "debit" | "credit",
): number {
  return lines
    .filter((line) => line.side === side)
    .reduce((sum, line) => sum + Number(line.amount.replaceAll(",", "")), 0);
}
