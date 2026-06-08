import { describe, expect, it } from "vitest";

import type { FixedAssetPreviewItem } from "../assist/fixed-asset-data";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover";
import { getEntryLines, type EntryRecord } from "./entry-record";
import { parseAmount } from "../shared/parse-utils";
import {
  buildClosingVirtualEntries,
  buildVirtualBusinessRateTransferRows,
  buildVirtualFixedAssetRows,
  materializeVirtualEntryRows,
  withClosingVirtualEntries,
} from "./virtual-entries";

function depreciatingAsset(
  overrides: Partial<FixedAssetPreviewItem> = {},
): FixedAssetPreviewItem {
  return {
    id: "fa-1",
    name: "業務用PC",
    account: "工具器具備品",
    period: "",
    remaining: "",
    progress: 0,
    current: "",
    purchase: "1,200,000",
    status: "償却中",
    acquisitionDate: "2025-01-01",
    acquisitionCost: 1_200_000,
    usefulLife: 5,
    ...overrides,
  };
}

function carryover(
  overrides: Partial<OpeningCarryoverRecord> = {},
): OpeningCarryoverRecord {
  return {
    id: "oc-1",
    fiscalPeriodId: "fp-2026",
    date: "2026-01-01",
    description: "再振替: 未払金",
    debit: "未払金",
    debitType: "liability",
    debitAmount: "50,000",
    credit: "通信費",
    creditType: "expense",
    creditAmount: "50,000",
    partner: "",
    taxCategory: "対象外",
    businessCategory: "",
    businessRate: "",
    ...overrides,
  };
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
});

describe("materializeVirtualEntryRows", () => {
  it("reconstructs a balanced EntryRecord from virtual rows", () => {
    const rows = buildVirtualFixedAssetRows({
      fiscalPeriodId: "fp-2026",
      assets: [depreciatingAsset()],
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      yearMonth: "2026-12",
    });
    const [record] = materializeVirtualEntryRows({
      fiscalPeriodId: "fp-2026",
      yearMonth: "2026-12",
      rows,
    });

    expect(record!.date).toBe("2026-12-31");
    expect(record!.localId).toBe("virtual:virtual-fixed-asset-fa-1");
    const lines = getEntryLines(record!);
    const debit = lines
      .filter((line) => line.side === "debit")
      .reduce((sum, line) => sum + parseAmount(line.amount), 0);
    const credit = lines
      .filter((line) => line.side === "credit")
      .reduce((sum, line) => sum + parseAmount(line.amount), 0);
    expect(debit).toBe(240_000);
    expect(credit).toBe(240_000);
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
  const rentEntry = (businessRate: string): EntryRecord => ({
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
    businessCategory: "",
  });

  it("emits one balanced period-end transfer moving the personal portion to 事業主貸", () => {
    const entries = buildClosingVirtualEntries({
      fiscalPeriodId: "fp-2026",
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [rentEntry("50")],
      assets: [],
      carryovers: [],
    });

    expect(entries).toHaveLength(1);
    const transfer = entries[0]!;
    expect(transfer.localId).toBe("virtual:business-rate-transfer");
    expect(transfer.date).toBe("2026-12-31");
    const lines = getEntryLines(transfer);
    expect(lines.filter((line) => line.side === "debit")).toEqual([
      {
        side: "debit",
        accountName: "事業主貸",
        accountType: "asset",
        amount: "10,500",
      },
    ]);
    expect(lines.filter((line) => line.side === "credit")).toEqual([
      {
        side: "credit",
        accountName: "地代家賃",
        accountType: "expense",
        amount: "10,500",
      },
    ]);
  });

  it("emits no transfer when every entry is fully business use", () => {
    expect(
      buildClosingVirtualEntries({
        fiscalPeriodId: "fp-2026",
        periodStartDate: "2026-01-01",
        periodEndDate: "2026-12-31",
        entries: [rentEntry("")],
        assets: [],
        carryovers: [],
      }),
    ).toEqual([]);
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
    const lines = getEntryLines(transfer!);
    const ownerDraw = lines.find((line) => line.accountName === "事業主貸");
    const depreciation = lines.find(
      (line) => line.accountName === "減価償却費",
    );
    expect(parseAmount(ownerDraw!.amount)).toBe(120_000);
    expect(ownerDraw!.side).toBe("debit");
    expect(parseAmount(depreciation!.amount)).toBe(120_000);
    expect(depreciation!.side).toBe("credit");
  });
});

describe("buildVirtualBusinessRateTransferRows", () => {
  const rentEntry: EntryRecord = {
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
    businessRate: "50",
    taxCategory: "課税 10%",
    businessCategory: "",
  };

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
