import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ImportProblemsDialog } from "./import-problems-dialog.js";

function render(problemCount: number): string {
  return renderToStaticMarkup(
    <ImportProblemsDialog
      problems={Array.from({ length: problemCount }, (_, index) => ({
        rowNumber: index + 2,
        message: `理由 ${index + 1}`,
      }))}
      onClose={() => {}}
    />,
  );
}

describe("ImportProblemsDialog", () => {
  it("lists each unreadable row with its row number and reason under a fixed title", () => {
    const html = render(2);

    expect(html).toContain("CSV を取り込めません");
    expect(html).toContain("読めない行があります。何も変えていません。");
    expect(html).toContain("<b");
    expect(html.replace(/<[^>]*>/g, "")).toContain("2 行目理由 13 行目理由 2");
    expect(html).not.toContain("ほか");
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("says how many more rows the list holds when they do not all fit", () => {
    expect(render(8)).toContain("ほか 3 行");
  });
});
