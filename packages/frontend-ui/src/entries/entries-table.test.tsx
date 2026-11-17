import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EntryPreviewRow } from "@rubydogjp/openkk-driver";

import { EntriesTable } from "./entries-table.js";

function previewRow(
  lineIndex: number,
  overrides: Partial<EntryPreviewRow>,
): EntryPreviewRow {
  return {
    recordId: "entry-1",
    lineIndex,
    lineCount: 2,
    isFirstOfRecord: lineIndex === 0,
    date: "2026-05-10",
    weekday: "日",
    debit: "消耗品費",
    debitType: "expense",
    debitAmount: "1,000",
    debitBookAccountId: null,
    debitPartnerName: null,
    debitTaxCategoryId: null,
    debitBusinessCategoryId: null,
    credit: "現金",
    creditType: "asset",
    creditAmount: "1,000",
    creditBookAccountId: null,
    creditPartnerName: null,
    creditTaxCategoryId: null,
    creditBusinessCategoryId: null,
    description: "文具の購入",
    partner: "文具店",
    businessRate: 1,
    taxCategory: "課税仕入 10%",
    businessCategory: "",
    virtual: null,
    ...overrides,
  };
}

function render(rows: EntryPreviewRow[]): string {
  return renderToStaticMarkup(
    <EntriesTable
      rows={rows}
      onOpenEntry={() => {}}
      onAddEntry={null}
      tableRef={null}
      activeRecordId={null}
      fillHeight={false}
      headerTone={null}
    />,
  );
}

describe("EntriesTable", () => {
  it("is a table of rows and cells with column headers", () => {
    const html = render([previewRow(0, {})]);
    expect(html).toContain('role="table"');
    expect(html.match(/role="columnheader"/g)).toHaveLength(10);
    expect(html.match(/role="row"/g)).toHaveLength(2);
    expect(html.match(/role="cell"/g)).toHaveLength(10);
    expect(html).not.toContain('role="button"');
  });

  it("reads a repeated line as the values of the first line", () => {
    const html = render([previewRow(0, {}), previewRow(1, {})]);
    expect(html).toContain('<span aria-hidden="true">〃</span>');
    expect(html).toContain('<span class="bk-visually-hidden">10日 (日)</span>');
    expect(html).toContain(
      '<span class="bk-visually-hidden">文具の購入</span>',
    );
    expect(html).toContain('<span class="bk-visually-hidden">なし</span>');
  });
});
