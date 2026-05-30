import { describe, expect, it } from "vitest";

import { exampleFixedAssetItems } from "../assist/fixed-asset-data";
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

  it("turns fixed assets into depreciation and disposal rows for the target period", () => {
    const depreciationRows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: exampleFixedAssetItems,
      periodEndDate: "2026-12-31",
      yearMonth: "2026-12",
    });
    const macbookDepreciation = depreciationRows.find((row) =>
      row.description.includes("MacBook Pro 14インチ"),
    );

    expect(macbookDepreciation).toMatchObject({
      date: "12/31",
      debit: "減価償却費",
      debitAmount: "94,500",
      credit: "工具器具備品",
      creditAmount: "94,500",
      businessRate: "80",
      virtual: {
        kind: "fixed_asset",
        label: "固定資産",
        assistHref: "/assist/fixed-assets?asset=fa-1",
      },
    });
    expect(computeFinancialSummary(depreciationRows)).toMatchObject({
      revenue: 0,
      expenses: 313_798,
      profit: -313_798,
    });

    const disposalRows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: exampleFixedAssetItems,
      periodEndDate: "2026-12-31",
      yearMonth: "2026-09",
    });

    expect(disposalRows).toContainEqual(
      expect.objectContaining({
        date: "09/30",
        debit: "普通預金",
        debitAmount: "130,000",
        credit: "機械装置",
        creditAmount: "130,000",
        description: "撮影用ミラーレス一眼の売却",
        virtual: expect.objectContaining({
          kind: "fixed_asset",
          assistHref: "/assist/fixed-assets?asset=fa-5",
        }),
      }),
    );
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
  });
});

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
    taxCategory: "課税10%",
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
