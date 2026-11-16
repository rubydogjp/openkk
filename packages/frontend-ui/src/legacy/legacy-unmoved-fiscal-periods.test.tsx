import { describe, expect, it } from "vitest";

import { legacyUnmovedFiscalPeriodsMessage } from "./legacy-unmoved-fiscal-periods.js";

describe("legacyUnmovedFiscalPeriodsMessage", () => {
  it("counts the periods that could not be moved", () => {
    expect(legacyUnmovedFiscalPeriodsMessage(2)).toBe(
      "前の版から移せなかった会計期間が 2 件あります",
    );
  });
});
