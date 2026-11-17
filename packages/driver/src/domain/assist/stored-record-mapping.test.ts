import { describe, expect, it } from "vitest";

import { mapOpeningJournalToRecord } from "./stored-record-mapping.js";

describe("mapOpeningJournalToRecord", () => {
  it("names an account the app does not know as a custom one and keeps the side of each line", () => {
    const record = mapOpeningJournalToRecord(
      {
        id: "journal-1",
        date: "2026-01-01",
        description: "再振替",
        businessRate: 1,
        lines: [
          {
            id: "line-1",
            side: "debit",
            bookAccountId: "acct_from_a_newer_app",
            amount: 500,
            partnerName: "",
            taxCategoryId: "tax_out_of_scope",
            businessCategoryId: "biz_none",
          },
          {
            id: "line-2",
            side: "credit",
            bookAccountId: "acct_cash",
            amount: 500,
            partnerName: "",
            taxCategoryId: "tax_out_of_scope",
            businessCategoryId: "biz_none",
          },
        ],
      },
      "fp-1",
      { acct_cash: "現金" },
      { acct_cash: "asset" },
      { tax_out_of_scope: "対象外" },
      { biz_none: "対象外" },
    );

    expect(
      record.lines.map((line) => [line.side, line.accountName, line.amount]),
    ).toEqual([
      ["debit", "カスタム(acct_from_a_newer_app)", "500"],
      ["credit", "現金", "500"],
    ]);
  });
});
