import { describe, expect, it } from "vitest";

import {
  computePeriodDepreciation,
  computeStraightLineDepreciation,
} from "./fixed-asset-depreciation";

describe("computeStraightLineDepreciation", () => {
  it("computes half-life progress and book value", () => {
    const result = computeStraightLineDepreciation({
      acquisitionDate: "2024-01-01",
      acquisitionCost: 1_200_000,
      usefulLife: 4, // 48 months
      asOf: new Date(2025, 11, 31), // 2024-01〜2025-12 = 24 months (取得月算入)
    });
    expect(result.elapsedMonths).toBe(24);
    expect(result.totalMonths).toBe(48);
    expect(result.progress).toBeCloseTo(0.5, 5);
    expect(result.accumulated).toBe(599_999);
    expect(result.currentBookValue).toBe(600_001);
    expect(result.annualDepreciation).toBe(300_000);
    expect(result.remainingMonths).toBe(24);
    expect(result.remainingLabel).toBe("あと24ヶ月");
    expect(result.periodLabel).toBe("2024年1月〜");
  });

  it("caps at full depreciation past the useful life", () => {
    const result = computeStraightLineDepreciation({
      acquisitionDate: "2020-01-01",
      acquisitionCost: 500_000,
      usefulLife: 3,
      asOf: new Date(2030, 0, 1),
    });
    expect(result.progress).toBe(1);
    expect(result.currentBookValue).toBe(1);
    expect(result.accumulated).toBe(499_999);
    expect(result.remainingMonths).toBe(0);
    expect(result.remainingLabel).toBe("償却済み");
  });

  it("treats a not-yet-started or invalid acquisition date as zero progress", () => {
    const beforeStart = computeStraightLineDepreciation({
      acquisitionDate: "2026-06-01",
      acquisitionCost: 100_000,
      usefulLife: 5,
      asOf: new Date(2026, 0, 1), // before acquisition
    });
    expect(beforeStart.progress).toBe(0);
    expect(beforeStart.currentBookValue).toBe(100_000);

    const invalid = computeStraightLineDepreciation({
      acquisitionDate: "",
      acquisitionCost: 100_000,
      usefulLife: 5,
      asOf: new Date(2026, 0, 1),
    });
    expect(invalid.progress).toBe(0);
    expect(invalid.currentBookValue).toBe(100_000);
    expect(invalid.periodLabel).toBe("");
  });

  it("treats invalid calendar acquisition dates as zero progress", () => {
    const result = computeStraightLineDepreciation({
      acquisitionDate: "2026-02-29",
      acquisitionCost: 100_000,
      usefulLife: 5,
      asOf: new Date(2026, 2, 1),
    });

    expect(result.progress).toBe(0);
    expect(result.currentBookValue).toBe(100_000);
    expect(result.periodLabel).toBe("");
  });

  it("clamps useful life to at least one year", () => {
    const result = computeStraightLineDepreciation({
      acquisitionDate: "2026-01-01",
      acquisitionCost: 120_000,
      usefulLife: 0,
      asOf: new Date(2026, 5, 1), // 2026-01〜2026-06 = 6 months (取得月算入)
    });
    expect(result.totalMonths).toBe(12);
    expect(result.annualDepreciation).toBe(60_000);
  });

  it("keeps zero-cost assets at zero book value", () => {
    const result = computeStraightLineDepreciation({
      acquisitionDate: "2026-01-01",
      acquisitionCost: 0,
      usefulLife: 4,
      asOf: new Date(2030, 0, 1),
    });
    expect(result.currentBookValue).toBe(0);
    expect(result.accumulated).toBe(0);
  });
});

describe("computePeriodDepreciation", () => {
  const cost = 1_200_000;
  const usefulLife = 5; // 60 months / depreciable 1,199,999

  it("books a full year for an asset held the entire fiscal period", () => {
    expect(
      computePeriodDepreciation({
        acquisitionDate: "2025-01-01",
        acquisitionCost: cost,
        usefulLife,
        periodStartDate: new Date(2026, 0, 1),
        asOf: new Date(2026, 11, 31),
      }),
    ).toBe(240_000);
  });

  it("prorates the acquisition year by months in service (取得月算入)", () => {
    // 2026-04 取得 → 4〜12月の 9 ヶ月分。
    expect(
      computePeriodDepreciation({
        acquisitionDate: "2026-04-10",
        acquisitionCost: cost,
        usefulLife,
        periodStartDate: new Date(2026, 0, 1),
        asOf: new Date(2026, 11, 31),
      }),
    ).toBe(179_999);
  });

  it("prorates the disposal year up to the disposal month", () => {
    // 2024-01 取得・2026-06 処分 → 当期は 1〜6月の 6 ヶ月分。
    expect(
      computePeriodDepreciation({
        acquisitionDate: "2024-01-01",
        acquisitionCost: cost,
        usefulLife,
        periodStartDate: new Date(2026, 0, 1),
        asOf: new Date(2026, 5, 15),
      }),
    ).toBe(120_000);
  });

  it("books nothing once the asset is fully depreciated before the period", () => {
    expect(
      computePeriodDepreciation({
        acquisitionDate: "2020-01-01",
        acquisitionCost: 500_000,
        usefulLife: 3,
        periodStartDate: new Date(2026, 0, 1),
        asOf: new Date(2026, 11, 31),
      }),
    ).toBe(0);
  });
});
