import { describe, expect, it } from "vitest";

import { entryRecord } from "../../test-support/entry-record.js";
import type { FixedAsset } from "../assist/fixed-asset-data.js";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover.js";
import type { EntryRecord } from "./entry-record.js";
import { parseAmount } from "../shared/parse-utils.js";
import {
  buildClosingVirtualEntries,
  buildAnalyticsEntries,
  buildVirtualBusinessRateTransferRows,
  buildVirtualFixedAssetRows,
  buildVirtualFixedAssetEntries,
  withClosingVirtualEntries,
} from "./virtual-entries.js";

function depreciatingAsset(
  overrides: Partial<FixedAsset> = {},
): FixedAsset {
  const base: FixedAsset = {
    id: "fa-1",
    name: "業務用PC",
    accountName: "工具器具備品",
    bookAccountId: "acct_equipment",
    status: "償却中",
    acquisitionDate: "2025-01-01",
    acquisitionCost: 1_200_000,
    usefulLife: 5,
    fiscalPeriodId: "fp-2026",
    businessRate: 1,
    disposalDate: null,
    disposalPrice: null,
    depreciationStartLabel: "",
    remainingDepreciationLabel: "",
    depreciationProgress: 0,
    currentBookValue: 1_200_000,
  };
  return Object.assign(base, overrides);
}

function carryover(
  overrides: Partial<OpeningCarryoverRecord> = {},
): OpeningCarryoverRecord {
  const base: OpeningCarryoverRecord = {
    id: "oc-1",
    fiscalPeriodId: "fp-2026",
    date: "2026-01-01",
    description: "再振替: 未払金",
    businessRate: 1,
    lines: [
      {
        id: "oc-1-d",
        side: "debit",
        accountName: "未払金",
        accountType: "liability",
        amount: "50,000",
        bookAccountId: null,
        partnerName: "",
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: "",
      },
      {
        id: "oc-1-c",
        side: "credit",
        accountName: "通信費",
        accountType: "expense",
        amount: "50,000",
        bookAccountId: null,
        partnerName: "",
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: "",
      },
    ],
  };
  return Object.assign(base, overrides);
}

describe("buildVirtualFixedAssetRows", () => {
  it("books a full-year depreciation row only in the period-end month", () => {
    const args = {
      fiscalPeriodId: "fp-2026",
      assets: [depreciatingAsset()],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
    };

    expect(
      buildVirtualFixedAssetRows({ ...args, yearMonth: "2026-06" }),
    ).toEqual([]);

    const endRows = buildVirtualFixedAssetRows({
      ...args,
      yearMonth: "2026-12",
    });
    expect(endRows).toHaveLength(1);
    expect(endRows[0]).toMatchObject({
      debit: "減価償却費",
      debitType: "expense",
      debitAmount: "240,000",
      credit: "工具器具備品",
      creditType: "asset",
      creditAmount: "240,000",
    });
  });

  it("depreciates through a sale date and removes the remaining book value", () => {
    const entries = buildVirtualFixedAssetEntries({
      fiscalPeriodId: "fp-2026",
      assets: [
        depreciatingAsset({
          status: "売却済",
          disposalDate: "2026-06-15",
          disposalPrice: 900_000,
        }),
      ],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
    });

    expect(entries).toHaveLength(2);
    const depreciation = entries.find((item) =>
      item.localId?.includes("virtual-fixed-asset-fa-1"),
    );
    const sale = entries.find((item) =>
      item.localId?.includes("virtual-fixed-asset-sale-fa-1"),
    );
    expect(depreciation?.lines).toEqual([
      expect.objectContaining({ side: "debit", amount: "120,000" }),
      expect.objectContaining({ side: "credit", amount: "120,000" }),
    ]);
    expect(sale?.lines).toEqual([
      expect.objectContaining({
        side: "debit",
        accountName: "普通預金",
        amount: "900,000",
      }),
      expect.objectContaining({
        side: "credit",
        accountName: "工具器具備品",
        amount: "840,001",
      }),
      expect.objectContaining({
        side: "credit",
        accountName: "固定資産売却益",
        amount: "59,999",
      }),
    ]);
  });

  it("keeps the final-year depreciation when the asset is marked complete", () => {
    const rows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: [
        depreciatingAsset({
          status: "完了",
          acquisitionDate: "2023-01-01",
          usefulLife: 4,
        }),
      ],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      yearMonth: "2026-12",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        debit: "減価償却費",
        debitAmount: "300,000",
        creditAmount: "300,000",
      }),
    ]);
  });
});

describe("generated entry records", () => {
  it("builds a balanced period-end depreciation entry", () => {
    const [record] = buildVirtualFixedAssetEntries({
      fiscalPeriodId: "fp-2026",
      assets: [depreciatingAsset()],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
    });

    expect(record!.date).toBe("2026-12-31");
    expect(record!.localId).toBe("virtual:virtual-fixed-asset-fa-1");
    const lines = record!.lines;
    const debit = lines
      .filter((line) => line.side === "debit")
      .reduce((sum, line) => sum + parseAmount(line.amount), 0);
    const credit = lines
      .filter((line) => line.side === "credit")
      .reduce((sum, line) => sum + parseAmount(line.amount), 0);
    expect(debit).toBe(240_000);
    expect(credit).toBe(240_000);
  });

  it("keeps per-line partner and categories instead of the merged display text", () => {
    const entries = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      assets: [],
      carryovers: [
        carryover({
          lines: [
            {
              id: "l1",
              side: "debit",
              accountName: "売掛金",
              accountType: "asset",
              amount: "50,000",
              bookAccountId: "acct_accounts_receivable",
              partnerName: "得意先A",
              taxCategoryId: "tax_out_of_scope",
              taxCategoryName: "対象外",
              businessCategoryId: "biz_none",
              businessCategoryName: null,
            },
            {
              id: "l2",
              side: "credit",
              accountName: "売上",
              accountType: "revenue",
              amount: "50,000",
              bookAccountId: "acct_sales",
              partnerName: "得意先B",
              taxCategoryId: "tax_sales_10",
              taxCategoryName: "課税売上 10%",
              businessCategoryId: "biz_none",
              businessCategoryName: null,
            },
          ],
        }),
      ],
    });

    const lines = entries[0]!.lines;
    expect(lines.map((line) => line.partnerName)).toEqual([
      "得意先A",
      "得意先B",
    ]);
    expect(lines.map((line) => line.taxCategoryId)).toEqual([
      "tax_out_of_scope",
      "tax_sales_10",
    ]);
    expect(lines.map((line) => line.taxCategoryName)).toEqual([
      "対象外",
      "課税売上 10%",
    ]);
    expect(lines.map((line) => line.businessCategoryId)).toEqual([
      "biz_none",
      "biz_none",
    ]);
  });

  it("preserves the exact fixed-asset business rate", () => {
    const [record] = buildVirtualFixedAssetEntries({
      fiscalPeriodId: "fp-2026",
      assets: [depreciatingAsset({ businessRate: 0.3333333333333333 })],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
    });

    expect(record?.businessRate).toBe(0.3333333333333333);
  });
});

describe("buildClosingVirtualEntries", () => {
  it("materializes both opening carryover and period-end depreciation", () => {
    const entries = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      assets: [depreciatingAsset()],
      carryovers: [carryover()],
    });

    expect(entries).toHaveLength(2);
    const depreciation = entries.find(
      (entry) => entry.localId === "virtual:virtual-fixed-asset-fa-1",
    );
    const reversal = entries.find(
      (entry) => entry.localId === "virtual:virtual-opening-carryover-oc-1",
    );
    expect(depreciation?.date).toBe("2026-12-31");
    expect(reversal?.date).toBe("2026-01-01");
  });
});

describe("buildClosingVirtualEntries / 家事按分の振替", () => {
  const rentEntry = (businessRate: number): EntryRecord =>
    entryRecord({
    id: "rent",
    fiscalPeriodId: "fp-2026",
    date: "2026-03-25",
    weekday: "",
    debit: "地代家賃",
    debitType: "expense",
    debitAmount: "21,000",
    credit: "普通預金",
    creditType: "asset",
    creditAmount: "21,000",
    description: "作業場賃料",
    partner: "",
    businessRate,
    taxCategory: "課税 10%",
  });

  it("emits one balanced period-end transfer moving the personal portion to 事業主貸", () => {
    const entries = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [rentEntry(0.5)],
      assets: [],
      carryovers: [],
    });

    expect(entries).toHaveLength(1);
    const transfer = entries[0]!;
    expect(transfer.localId).toBe("virtual:business-rate-transfer");
    expect(transfer.date).toBe("2026-12-31");
    const lines = transfer.lines;
    expect(lines.filter((line) => line.side === "debit")).toEqual([
      {
        side: "debit",
        accountName: "事業主貸",
        accountType: "asset",
        amount: "10,500",
        bookAccountId: "acct_proprietor_withdrawal",
        id: null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: null,
        businessCategoryId: null,
        businessCategoryName: null,
      },
    ]);
    expect(lines.filter((line) => line.side === "credit")).toEqual([
      {
        side: "credit",
        accountName: "地代家賃",
        accountType: "expense",
        amount: "10,500",
        id: null,
        bookAccountId: null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: null,
        businessCategoryId: null,
        businessCategoryName: null,
      },
    ]);
  });

  it("emits no transfer when every entry is fully business use", () => {
    expect(
      buildClosingVirtualEntries({
        fiscalPeriodId: "fp-2026",
        periodStartDate: "2026-01-01",
        periodEndDate: "2026-12-31",
        entries: [rentEntry(1)],
        assets: [],
        carryovers: [],
      }),
    ).toEqual([]);
  });

  it("applies a full-precision rate without rounding it first", () => {
    const [transfer] = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [rentEntry(0.3333333333333333)],
      assets: [],
      carryovers: [],
    });

    const ownerDraw = transfer!.lines.find(
      (line) => line.bookAccountId === "acct_proprietor_withdrawal",
    );
    expect(parseAmount(ownerDraw?.amount ?? "")).toBe(14_000);
  });

  it("includes the depreciation expense personal portion in the transfer", () => {
    const entries = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      assets: [depreciatingAsset({ businessRate: 0.5 })],
      carryovers: [],
    });

    const transfer = entries.find(
      (entry) => entry.localId === "virtual:business-rate-transfer",
    );
    // 減価償却費 240,000 の個人分 120,000 が 事業主貸 へ振り替わる。
    const lines = transfer!.lines;
    const ownerDraw = lines.find((line) => line.accountName === "事業主貸");
    const depreciation = lines.find(
      (line) => line.accountName === "減価償却費",
    );
    expect(parseAmount(ownerDraw!.amount)).toBe(120_000);
    expect(ownerDraw!.side).toBe("debit");
    expect(parseAmount(depreciation!.amount)).toBe(120_000);
    expect(depreciation!.side).toBe("credit");
  });

  it("keeps same-name accounts with different master IDs separate", () => {
    const sameNameEntry = (input: {
      id: string;
      bookAccountId: string;
      accountType: "expense" | "cost_of_sales";
      amount: string;
    }): EntryRecord => ({
      ...rentEntry(0.5),
      id: input.id,
      lines: [
        {
          side: "debit",
          accountName: "賞与",
          accountType: input.accountType,
          amount: input.amount,
          bookAccountId: input.bookAccountId,
          id: null,
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
          amount: input.amount,
          bookAccountId: "acct_bank",
          id: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
      ],
    });
    const [transfer] = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [
        sameNameEntry({
          id: "cost",
          bookAccountId: "acct_cost_of_sales_賞与",
          accountType: "cost_of_sales",
          amount: "100",
        }),
        sameNameEntry({
          id: "expense",
          bookAccountId: "acct_expense_賞与",
          accountType: "expense",
          amount: "200",
        }),
      ],
      assets: [],
      carryovers: [],
    });

    const bonusCredits = transfer!.lines.filter(
      (line) => line.accountName === "賞与" && line.side === "credit",
    );
    expect(bonusCredits).toEqual([
      expect.objectContaining({
        bookAccountId: "acct_cost_of_sales_賞与",
        amount: "50",
      }),
      expect.objectContaining({
        bookAccountId: "acct_expense_賞与",
        amount: "100",
      }),
    ]);
  });
});

describe("buildVirtualBusinessRateTransferRows", () => {
  const rentEntry: EntryRecord = entryRecord({
    id: "rent",
    fiscalPeriodId: "fp-2026",
    date: "2026-03-25",
    weekday: "",
    debit: "地代家賃",
    debitType: "expense",
    debitAmount: "21,000",
    credit: "普通預金",
    creditType: "asset",
    creditAmount: "21,000",
    description: "作業場賃料",
    partner: "",
    businessRate: 0.5,
    taxCategory: "課税 10%",
  });

  it("shows a 家事按分 badge row in the period-end month", () => {
    const rows = buildVirtualBusinessRateTransferRows({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [rentEntry],
      assets: [],
      carryovers: [],
      yearMonth: "2026-12",
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((row) => row.virtual?.kind === "business_rate_transfer"),
    ).toBe(true);
    expect(rows.every((row) => row.virtual?.assistHref == null)).toBe(true);
    expect(rows[0]!.recordId).toBe("business-rate-transfer");
  });

  it("shows nothing outside the period-end month", () => {
    expect(
      buildVirtualBusinessRateTransferRows({
        fiscalPeriodId: "fp-2026",
        periodStartDate: "2026-01-01",
        periodEndDate: "2026-12-31",
        entries: [rentEntry],
        assets: [],
        carryovers: [],
        yearMonth: "2026-03",
      }),
    ).toEqual([]);
  });
});

describe("withClosingVirtualEntries", () => {
  it("appends virtual entries to real entries", () => {
    const result = withClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      assets: [depreciatingAsset()],
      carryovers: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.localId).toBe("virtual:virtual-fixed-asset-fa-1");
  });

  it("does not double-count entries already materialized during final closing", () => {
    const alreadyMaterialized = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      assets: [depreciatingAsset()],
      carryovers: [],
    });

    const result = withClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: alreadyMaterialized,
      assets: [depreciatingAsset()],
      carryovers: [],
    });

    expect(result).toHaveLength(alreadyMaterialized.length);
    expect(
      result.filter(
        (entry) => entry.localId === "virtual:virtual-fixed-asset-fa-1",
      ),
    ).toHaveLength(1);
  });
});

describe("buildAnalyticsEntries", () => {
  it("includes assist entries but excludes the business-rate transfer", () => {
    const result = buildAnalyticsEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [
        entryRecord({
          id: "rent",
          fiscalPeriodId: "fp-2026",
          date: "2026-03-01",
          weekday: "",
          debit: "地代家賃",
          debitType: "expense",
          debitAmount: "100,000",
          credit: "普通預金",
          creditType: "asset",
          creditAmount: "100,000",
          description: "事務所家賃",
          partner: "",
          businessRate: 0.5,
          taxCategory: "対象外",
          businessCategory: "対象外",
        }),
      ],
      assets: [depreciatingAsset()],
      carryovers: [carryover()],
    });

    expect(result.some((entry) => entry.id === "rent")).toBe(true);
    expect(
      result.some(
        (entry) => entry.localId === "virtual:virtual-fixed-asset-fa-1",
      ),
    ).toBe(true);
    expect(
      result.some(
        (entry) => entry.localId === "virtual:virtual-opening-carryover-oc-1",
      ),
    ).toBe(true);
    expect(
      result.some(
        (entry) => entry.localId === "virtual:business-rate-transfer",
      ),
    ).toBe(false);
  });
});
