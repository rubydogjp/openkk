import { describe, expect, it } from "vitest";

import {
  capFixedAssetPreviewDate,
  computeFixedAssetDraftPeriodDepreciation,
  resolveFixedAssetDraftPreviewDate,
  validateFixedAssetDraft,
} from "./fixed-asset-draft.js";
import type { FixedAssetDraft } from "./fixed-asset-data.js";

describe("capFixedAssetPreviewDate", () => {
  it("caps a historical period preview at the fiscal period end", () => {
    const result = capFixedAssetPreviewDate(
      new Date(2027, 7, 31),
      "2026-12-31",
    );

    expect([
      result.getFullYear(),
      result.getMonth() + 1,
      result.getDate(),
    ]).toEqual([2026, 12, 31]);
  });

  it("keeps today while the fiscal period is still in progress", () => {
    const today = new Date(2026, 7, 31);

    expect(capFixedAssetPreviewDate(today, "2026-12-31")).toBe(today);
  });

  it("falls back to today when the period end is absent or invalid", () => {
    const today = new Date(2026, 7, 31);

    expect(capFixedAssetPreviewDate(today, null)).toBe(today);
    expect(capFixedAssetPreviewDate(today, "2026-02-30")).toBe(today);
  });
});

describe("resolveFixedAssetDraftPreviewDate", () => {
  it("keeps active-asset previews at the period-capped date", () => {
    const periodEnd = new Date(2026, 11, 31);

    expect(
      resolveFixedAssetDraftPreviewDate(periodEnd, "償却中", "2027-08-31", null),
    ).toBe(periodEnd);
  });

  it("uses a valid disposal date for sold and disposed assets", () => {
    for (const status of ["売却済", "廃棄済"] as const) {
      const result = resolveFixedAssetDraftPreviewDate(
        new Date(2026, 11, 31),
        status,
        "2026-09-20",
        null,
      );
      expect([
        result.getFullYear(),
        result.getMonth() + 1,
        result.getDate(),
      ]).toEqual([2026, 9, 20]);
    }
  });

  it("falls back to the period-capped date for an invalid disposal date", () => {
    const periodEnd = new Date(2026, 11, 31);

    expect(
      resolveFixedAssetDraftPreviewDate(periodEnd, "売却済", "2026-02-30", null),
    ).toBe(periodEnd);
  });

  it("uses the fiscal period end for a completed asset", () => {
    const today = new Date(2026, 7, 31);
    const periodEnd = new Date(2026, 11, 31);

    expect(
      resolveFixedAssetDraftPreviewDate(today, "完了", null, periodEnd),
    ).toBe(periodEnd);
  });
});

describe("computeFixedAssetDraftPeriodDepreciation", () => {
  it("shows acquisition-year depreciation only for months in this period", () => {
    expect(
      computeFixedAssetDraftPeriodDepreciation({
        draft: {
          name: "業務用PC",
          account: "工具器具備品",
          acquisitionDate: "2026-04-10",
          acquisitionCost: "1,200,000",
          usefulLife: 5,
          businessRatePercent: 100,
          status: "償却中",
          businessRate: null,
          disposalDate: null,
          disposalPrice: null,
        },
        periodStartDate: "2026-01-01",
        asOf: new Date(2026, 11, 31),
      }),
    ).toBe(179_999);
  });
});

describe("validateFixedAssetDraft", () => {
  const draft = (patch: Partial<FixedAssetDraft> = {}): FixedAssetDraft => {
    const base: FixedAssetDraft = {
      name: "業務用PC",
      account: "工具器具備品",
      acquisitionDate: "2026-04-01",
      acquisitionCost: "180000",
      usefulLife: 4,
      businessRatePercent: 100,
      status: "償却中",
      businessRate: null,
      disposalDate: null,
      disposalPrice: null,
    };
    return Object.assign(base, patch);
  };
  const validate = (value: FixedAssetDraft, currentBookValue = 100) =>
    validateFixedAssetDraft({
      draft: value,
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      currentBookValue,
    });

  it("accepts an active asset acquired before or during the fiscal period", () => {
    expect(validate(draft())).toBeNull();
    expect(validate(draft({ acquisitionDate: "2025-12-01" }))).toBeNull();
  });

  it("rejects acquisitions after the fiscal-period end", () => {
    expect(validate(draft({ acquisitionDate: "2027-01-01" }))).toMatch(
      /終了日以前/,
    );
  });

  it("rejects unsafe monetary values and excessive useful lives", () => {
    expect(
      validate(draft({ acquisitionCost: "9007199254740993" })),
    ).toMatch(/安全に計算/);
    expect(validate(draft({ usefulLife: 101 }))).toMatch(/1〜100年/);
  });

  it("requires disposal dates to follow acquisition and stay in-period", () => {
    expect(
      validate(
        draft({
          status: "廃棄済",
          acquisitionDate: "2026-04-01",
          disposalDate: "2026-03-31",
        }),
      ),
    ).toMatch(/取得日以降/);
    expect(
      validate(
        draft({
          status: "廃棄済",
          acquisitionDate: "2025-04-01",
          disposalDate: "2025-12-31",
        }),
      ),
    ).toMatch(/会計期間内/);
  });

  it("accepts a zero-yen sale only when an explicit price was entered", () => {
    const sale: Partial<FixedAssetDraft> = {
      status: "売却済",
      disposalDate: "2026-10-01",
    };

    expect(validate(draft({ ...sale, disposalPrice: "0" }))).toBeNull();
    expect(validate(draft({ ...sale, disposalPrice: "" }))).toMatch(/売却額/);
  });

  it("does not allow early completion", () => {
    expect(validate(draft({ status: "完了" }), 2)).toMatch(/完了していない/);
    expect(validate(draft({ status: "完了" }), 1)).toBeNull();
  });
});
