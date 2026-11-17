import { describe, expect, it } from "vitest";

import {
  accountOfLine,
  entryLinesToInputs,
  storedEntryToRecord,
  type EntryLineMaster,
} from "./entry-input-mapping.js";

const MASTER: EntryLineMaster = {
  accounts: [{ id: "acct_bank", name: "普通預金", accountType: "asset" }],
  otherAccounts: [
    { id: "acct_retired_fee", name: "旧手数料", accountType: "expense" },
  ],
  taxCategories: [{ id: "tax_out_of_scope", name: "対象外" }],
  businessCategories: [{ id: "biz_none", name: "対象外" }],
};

const LINE = {
  amount: 500,
  partnerName: "",
  taxCategoryId: "tax_out_of_scope",
  businessCategoryId: "biz_none",
};

describe("accounts outside the period's version of accounts and categories", () => {
  it("names an account another version has with its own name and kind, and one no version has as custom", () => {
    expect(accountOfLine("acct_bank", MASTER)).toEqual({
      name: "普通預金",
      accountType: "asset",
    });
    expect(accountOfLine("acct_retired_fee", MASTER)).toEqual({
      name: "旧手数料",
      accountType: "expense",
    });
    expect(accountOfLine("acct_from_a_newer_app", MASTER)).toEqual({
      name: "カスタム(acct_from_a_newer_app)",
      accountType: "asset",
    });
  });

  it("saves an entry that uses such an account again without changing it", () => {
    const record = storedEntryToRecord(
      {
        id: "e-1",
        date: "2026-04-01",
        description: "振込手数料",
        localId: null,
        businessRate: 1,
        lines: [
          { ...LINE, side: "debit", bookAccountId: "acct_retired_fee" },
          { ...LINE, side: "credit", bookAccountId: "acct_bank" },
        ],
      },
      "fp-1",
      MASTER,
    );

    expect(
      entryLinesToInputs(record.lines, MASTER, {
        messageForDeveloper: "unresolved",
        messageForUser: "見つかりません",
      }).map((line) => line.bookAccountId),
    ).toEqual(["acct_retired_fee", "acct_bank"]);
  });
});
