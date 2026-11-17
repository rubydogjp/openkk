import { describe, expect, it } from "vitest";

import {
  legacyChangedFiscalPeriodsMessage,
  legacyOverwriteMessage,
  legacyRemovedFiscalPeriodsMessage,
} from "./legacy-book-changes.js";

const PERIOD_2026 = {
  name: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};
const PERIOD_2027 = { ...PERIOD_2026, name: "2027年分" };

describe("notices about changes made in the previous version", () => {
  it("names the one period", () => {
    expect(legacyChangedFiscalPeriodsMessage([PERIOD_2026])).toBe(
      "前の版で「2026年分」が変わっています",
    );
    expect(legacyRemovedFiscalPeriodsMessage([PERIOD_2026])).toBe(
      "前の版で「2026年分」が消えています。こちらは消していません",
    );
    expect(legacyOverwriteMessage([PERIOD_2026])).toBe(
      "アプリの中の「2026年分」に、移したあとで入れた変更があります。前の版を優先して上書きすると失われます。",
    );
  });

  it("counts the periods when there are several or the name is unknown", () => {
    expect(legacyChangedFiscalPeriodsMessage([PERIOD_2026, PERIOD_2027])).toBe(
      "前の版で 2 件の会計期間が変わっています",
    );
    expect(
      legacyRemovedFiscalPeriodsMessage([{ ...PERIOD_2026, name: null }]),
    ).toBe("前の版で 1 件の会計期間が消えています。こちらは消していません");
    expect(legacyOverwriteMessage([PERIOD_2026, PERIOD_2027])).toBe(
      "アプリの中の 2 件の会計期間に、移したあとで入れた変更があります。前の版を優先して上書きすると失われます。",
    );
  });
});
