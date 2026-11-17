import { describe, expect, it } from "vitest";

import { legacyMergedFiscalPeriodsMessage } from "./legacy-merged-fiscal-periods.js";

const PERIOD_2023 = {
  name: "2023年分",
  startDate: "2023-01-01",
  endDate: "2023-12-31",
};

describe("legacyMergedFiscalPeriodsMessage", () => {
  it("names the one period that was merged", () => {
    expect(legacyMergedFiscalPeriodsMessage([PERIOD_2023])).toBe(
      "前の版で「2023年分」が 2 つあったので、1 つにまとめました",
    );
  });

  it("counts the periods when several were merged or the name is unknown", () => {
    expect(
      legacyMergedFiscalPeriodsMessage([
        PERIOD_2023,
        { ...PERIOD_2023, name: "2024年分" },
      ]),
    ).toBe("前の版で同じ会計期間が 2 つあったものを、2 件まとめました");
    expect(
      legacyMergedFiscalPeriodsMessage([{ ...PERIOD_2023, name: null }]),
    ).toBe("前の版で同じ会計期間が 2 つあったものを、1 件まとめました");
  });
});
