import { describe, expect, it } from "vitest";

import { FAKE_ACCOUNTS } from "../../../test-support/fake-backend.js";
import { entryRecord } from "../../../test-support/entry-record.js";
import {
  formatJournalExport,
  hasJournalTableChanges,
  planJournalImport,
} from "./journal-file.js";

const MASTER = {
  accounts: FAKE_ACCOUNTS,
  taxCategories: [{ id: "tax_out_of_scope", name: "対象外" }],
  businessCategories: [{ id: "biz_none", name: "対象外" }],
};
const PERIOD = { id: "fp-1", startDate: "2026-01-01", endDate: "2026-12-31" };

const SALE = entryRecord({
  id: "entry-1",
  fiscalPeriodId: "fp-1",
  date: "2026-03-01",
  description: "売上",
  debit: "現金",
  debitType: "asset",
  debitAmount: "1,200",
  debitBookAccountId: "acct_cash",
  credit: "売上高",
  creditType: "revenue",
  creditAmount: "1,200",
  creditBookAccountId: "acct_sales",
  taxCategory: "対象外",
  debitTaxCategoryId: "tax_out_of_scope",
  creditTaxCategoryId: "tax_out_of_scope",
  businessCategory: "対象外",
  debitBusinessCategoryId: "biz_none",
  creditBusinessCategoryId: "biz_none",
});

const encode = (text: string) => new TextEncoder().encode(text);

describe("planJournalImport", () => {
  it("plans no change for the table that was just exported", () => {
    const csv = formatJournalExport("csv", [SALE], MASTER);

    const plan = planJournalImport({
      fileKind: "csv",
      bytes: encode(csv),
      fiscalPeriod: PERIOD,
      currentEntries: [SALE],
      master: MASTER,
    });

    expect(plan.kind).toBe("replace");
    if (plan.kind !== "replace") return;
    expect(hasJournalTableChanges(plan.changes)).toBe(false);
    expect(plan.changes.unchangedCount).toBe(1);
  });

  it("plans to remove entries that the table no longer has", () => {
    const csv = formatJournalExport("csv", [], MASTER);

    const plan = planJournalImport({
      fileKind: "csv",
      bytes: encode(csv),
      fiscalPeriod: PERIOD,
      currentEntries: [SALE],
      master: MASTER,
    });

    expect(plan.kind).toBe("replace");
    if (plan.kind !== "replace") return;
    expect(plan.changes.removed.map((entry) => entry.id)).toEqual(["entry-1"]);
  });

  it("reports the rows it cannot read instead of planning a change", () => {
    const csv = formatJournalExport("csv", [SALE], MASTER).replace(
      "2026-03-01",
      "2030-03-01",
    );

    const plan = planJournalImport({
      fileKind: "csv",
      bytes: encode(csv),
      fiscalPeriod: PERIOD,
      currentEntries: [SALE],
      master: MASTER,
    });

    expect(plan.kind).toBe("problems");
  });

  it("only appends entries from a JSON file", () => {
    const json = formatJournalExport("json", [SALE], MASTER);

    const plan = planJournalImport({
      fileKind: "json",
      bytes: encode(json),
      fiscalPeriod: PERIOD,
      currentEntries: [],
      master: MASTER,
    });

    expect(plan.kind).toBe("append");
    if (plan.kind !== "append") return;
    expect(plan.fromLegacyCsv).toBe(false);
    expect(plan.entries).toHaveLength(1);
  });
});
