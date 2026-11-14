import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  JournalSheetScreen,
  type JournalSheetRow,
} from "./journal-sheet-screen.js";

function row(entryNumber: string, amount: string): JournalSheetRow {
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
  };
}

function render(rows: JournalSheetRow[]): string {
  return renderToStaticMarkup(
    <JournalSheetScreen
      fiscalPeriodName="2026年分"
      saveControl={null}
      rows={rows}
      lockedMessage={null}
      onBack={() => {}}
      onImportFile={null}
      onExport={() => {}}
      onOpenRow={null}
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
      render([row("a", "1200"), row("b", "980000")]),
      "th",
    );

    expect(headings).toEqual([
      "",
      ..."ABCDEFGHIJK",
      "1",
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
      "仕訳番号",
      "2",
      "3",
    ]);
  });

  it("groups the digits of amounts on screen and leaves other cells as they are", () => {
    const cells = textsOf(render([row("2026", "980000")]), "td");

    expect(cells).toEqual([
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
      "2026",
    ]);
  });

  it("says so on row 2 when the period has no entries", () => {
    const html = render([]);

    expect(textsOf(html, "th").slice(-1)).toEqual(["2"]);
    expect(textsOf(html, "td")).toEqual(["この期間の仕訳はまだありません"]);
  });

  it("keeps every column at its own width so the sheet scrolls sideways instead of squeezing", () => {
    const html = render([row("a", "1200")]);

    expect(html).toContain("width:1522px");
    expect(html).not.toContain("width:100%");
  });
});
