import { describe, expect, it } from "vitest";

import type { EntryRecord } from "../entries/entry-record";
import { buildFinancialStatementsDocument } from "./financial-statements-print";
import { computeFsAggregate } from "./fs-data";
import { buildGeneralLedgerDocument } from "./general-ledger-print";
import { buildJournalDocument } from "./journal-print";

describe("print documents", () => {
  it("renders journal data from supplied entries and escapes HTML", () => {
    const html = buildJournalDocument("2026年分", [
      entry({ description: "売上 <確認>", partner: "A&B" }),
    ]);

    expect(html).toContain("<title>仕訳帳</title>");
    expect(html).toContain("売上 &lt;確認&gt;");
    expect(html).toContain("A&amp;B");
    expect(html).toContain("100,000");
  });

  it("renders general ledger balances from supplied entries and opening balances", () => {
    const html = buildGeneralLedgerDocument("2026年分", [entry({})], [
      { accountId: "a:普通預金", amount: 50_000 },
    ]);

    expect(html).toContain("<title>総勘定元帳</title>");
    expect(html).toContain("普通預金");
    expect(html).toContain("150,000");
  });

  it("renders financial statement values computed from supplied entries", () => {
    const aggregate = computeFsAggregate({
      openingBalanceLines: [{ accountId: "a:普通預金", amount: 50_000 }],
      entries: [entry({})],
    });
    const html = buildFinancialStatementsDocument({
      fpName: "2026年分",
      amounts: aggregate.amounts,
      bsRows: aggregate.bsRows,
    });

    expect(html).toContain("<title>財務諸表</title>");
    expect(html).toContain("100,000");
    expect(html).toContain("150,000");
  });
});

function entry(overrides: Partial<EntryRecord>): EntryRecord {
  return {
    id: "entry-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-15",
    weekday: "木",
    debit: "普通預金",
    debitType: "asset",
    debitAmount: "100,000",
    credit: "売上",
    creditType: "revenue",
    creditAmount: "100,000",
    description: "売上",
    partner: "取引先",
    businessRate: "",
    taxCategory: "課税売上",
    businessCategory: "",
    ...overrides,
  };
}
