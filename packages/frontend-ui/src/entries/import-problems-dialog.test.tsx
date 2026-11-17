import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ImportProblemsDialog } from "./import-problems-dialog.js";

function render(listed: number, problemCount = listed): string {
  return renderToStaticMarkup(
    <ImportProblemsDialog
      problems={Array.from({ length: listed }, (_, index) => ({
        rowNumber: index + 2,
        message: `理由 ${index + 1}`,
      }))}
      problemCount={problemCount}
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

  it("says how many more problems the list holds when they do not all fit", () => {
    expect(render(8)).toContain("ほか 3 件");
  });

  it("counts every problem, also those past the first ones it lists", () => {
    const html = render(100, 500);

    expect(html).toContain("ほか 495 件");
    expect(html).toContain("最初の 100 件だけ出しています");
    expect(html).toContain("読めない行 500 件");
  });

  it("lists the problems in row order", () => {
    const html = renderToStaticMarkup(
      <ImportProblemsDialog
        problems={[
          { rowNumber: 9, message: "後の行" },
          { rowNumber: 3, message: "前の行" },
        ]}
        problemCount={2}
        onClose={() => {}}
      />,
    );

    expect(html.replace(/<[^>]*>/g, "")).toContain("3 行目前の行9 行目後の行");
  });
});
