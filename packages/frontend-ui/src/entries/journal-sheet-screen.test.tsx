import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  JournalSheetScreen,
  type JournalSheetReview,
  type JournalSheetRow,
} from "./journal-sheet-screen.js";

function row(
  entryNumber: string,
  amount: string,
  status: JournalSheetRow["status"],
): JournalSheetRow {
  return {
    entryNumber,
    date: "2026-05-10",
    debitAccount: "普通預金",
    debitAmount: amount,
    creditAccount: "売上",
    creditAmount: amount,
    description: "売上",
    partner: "",
    taxCategory: "課税 10%",
    businessCategory: "対象外",
    businessRate: "100",
    entryKey: entryNumber,
    status,
  };
}

function render(
  rows: JournalSheetRow[],
  review: JournalSheetReview | null,
): string {
  return renderToStaticMarkup(
    <JournalSheetScreen
      fiscalPeriodName="2026年分"
      saveControl={null}
      rows={rows}
      review={review}
      lockedMessage={null}
      onBack={() => {}}
      onImportFile={null}
      onExport={() => {}}
      onOpenRow={null}
      onApplyReview={() => {}}
      onDismissReview={() => {}}
    />,
  );
}

function textsOf(html: string, tag: "th" | "td"): string[] {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "g"))].map(
    (match) => (match[1] ?? "").replace(/<[^>]*>/g, ""),
  );
}

describe("JournalSheetScreen", () => {
  it("letters the columns and numbers the rows like a spreadsheet that opened the CSV", () => {
    const headings = textsOf(
      render([row("a", "1200", null), row("b", "980000", null)], null),
      "th",
    );

    expect(headings).toEqual([
      "",
      ..."ABCDEFGHIJK",
      "1",
      "仕訳番号",
      "日付",
      "借方科目",
      "借方金額",
      "貸方科目",
      "貸方金額",
      "摘要",
      "取引先",
      "税区分",
      "事業区分",
      "事業割合",
      "2",
      "3",
    ]);
  });

  it("groups the digits of amounts on screen and leaves other cells as they are", () => {
    const cells = textsOf(render([row("2026", "980000", null)], null), "td");

    expect(cells).toEqual([
      "2026",
      "2026-05-10",
      "普通預金",
      "980,000",
      "売上",
      "980,000",
      "売上",
      "",
      "課税 10%",
      "対象外",
      "100",
    ]);
  });

  it("says so on row 2 when the period has no entries", () => {
    const html = render([], null);

    expect(textsOf(html, "th").slice(-1)).toEqual(["2"]);
    expect(textsOf(html, "td")).toEqual(["この期間の仕訳はまだありません"]);
  });

  it("adds an unlettered status column while a CSV is being reviewed", () => {
    const html = render([row("a", "1200", "changed")], {
      kind: "changes",
      added: 0,
      changed: 1,
      removed: 0,
      unchanged: 0,
      applying: false,
    });

    expect(textsOf(html, "th").slice(0, 3)).toEqual(["", "", "A"]);
    expect(textsOf(html, "td")[0]).toBe("変更");
    expect(html).toContain("反映する");
  });
});
