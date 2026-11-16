import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UnavailableFiscalPeriodRow } from "./unavailable-fiscal-period-row.js";

describe("UnavailableFiscalPeriodRow", () => {
  it("shows the name, the dates and the reason as a row that cannot be pressed", () => {
    const html = renderToStaticMarkup(
      <UnavailableFiscalPeriodRow
        period={{
          name: "2025年分",
          startDate: "2025-01-01",
          endDate: "2025-12-31",
        }}
        reason="移せませんでした"
        showDivider={false}
      />,
    );

    expect(html).toContain("2025年分");
    expect(html).toContain("2025-01-01 〜 2025-12-31");
    expect(html).toContain("移せませんでした");
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("<button");
  });

  it("says so when even the name could not be read", () => {
    const html = renderToStaticMarkup(
      <UnavailableFiscalPeriodRow
        period={{ name: null, startDate: null, endDate: null }}
        reason="読み込めませんでした"
        showDivider
      />,
    );

    expect(html).toContain("名前の分からない期間");
    expect(html).toContain("読み込めませんでした");
    expect(html).not.toContain("〜");
  });
});
