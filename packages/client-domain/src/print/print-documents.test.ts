import { describe, expect, it } from "vitest";

import type { EntryRecord } from "../entries/entry-record";
import { buildFinancialStatementsDocument } from "./financial-statements-print";
import { computeFsAggregate } from "./fs-data";
import { buildGeneralLedgerDocument } from "./general-ledger-print";
import { buildJournalDocument } from "./journal-print";

describe("print documents", () => {
  it("renders journal data from supplied entries and escapes HTML", () => {
    const html = buildJournalDocument("2026年分", [
      entry({
        date: "2026-01-15<script>",
        description: "売上 <確認>",
        partner: "A&B",
      }),
    ]);

    expect(html).toContain("<title>仕訳帳</title>");
    expect(html).toContain("2026/01/15&lt;script&gt;");
    expect(html).toContain("売上 &lt;確認&gt;");
    expect(html).toContain("A&amp;B");
    expect(html).toContain("100,000");
  });

  it("renders general ledger balances from supplied entries and opening balances", () => {
    const html = buildGeneralLedgerDocument(
      "2026年分",
      [entry({})],
      [{ accountId: "a:普通預金", amount: 50_000 }],
    );

    expect(html).toContain("<title>総勘定元帳</title>");
    expect(html).toContain("普通預金");
    expect(html).toContain("150,000");
    expect(html).toContain("前期繰越");
    expect(html).toContain("50,000");
  });

  it("renders every line of compound entries in journal and ledger documents", () => {
    const compound = entry({
      debit: "仕入",
      debitType: "cost_of_sales",
      debitAmount: "168,000",
      credit: "未払金",
      creditType: "liability",
      creditAmount: "210,000",
      description: "秋商材の仕入と配送費",
      lines: [
        {
          side: "debit",
          accountName: "仕入",
          accountType: "cost_of_sales",
          amount: "168,000",
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
        },
      ],
    });

    const journalHtml = buildJournalDocument("2026年分", [compound]);
    expect(journalHtml).toContain("荷造運賃");
    expect(journalHtml).toContain("42,000");
    expect(journalHtml).toContain("210,000");

    const ledgerHtml = buildGeneralLedgerDocument("2026年分", [compound], []);
    expect(ledgerHtml).toContain("荷造運賃");
    expect(ledgerHtml).toContain("未払金");
    expect(ledgerHtml).toContain("42,000");
  });

  it("normalises non-finite printed amounts to blanks", () => {
    const journalHtml = buildJournalDocument("2026年分", [
      entry({ debitAmount: "Infinity", creditAmount: "-Infinity" }),
    ]);
    const ledgerHtml = buildGeneralLedgerDocument(
      "2026年分",
      [entry({ debitAmount: "Infinity", creditAmount: "-Infinity" })],
      [],
    );
    const fsHtml = buildFinancialStatementsDocument({
      fpName: "2026年分",
      amounts: { 1: Infinity, 2: -Infinity },
      bsRows: [],
    });

    expect(journalHtml).not.toContain("Infinity");
    expect(ledgerHtml).not.toContain("Infinity");
    expect(fsHtml).not.toContain("Infinity");
  });

  it("does not render NaN month labels for malformed entry dates", () => {
    const malformedDateEntry = entry({ date: "not-a-date" });

    const journalHtml = buildJournalDocument("2026年分", [malformedDateEntry]);
    const ledgerHtml = buildGeneralLedgerDocument(
      "2026年分",
      [malformedDateEntry],
      [],
    );

    expect(journalHtml).not.toContain("NaN月");
    expect(ledgerHtml).not.toContain("NaN月");
    expect(journalHtml).toContain("日付未設定 合計");
    expect(ledgerHtml).toContain("日付未設定 合計");
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
