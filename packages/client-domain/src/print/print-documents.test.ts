import { describe, expect, it } from "vitest";

import {
  entryRecord,
  type EntryRecordOverrides,
} from "../../test-support/entry-record.js";
import type { EntryRecord } from "../entries/entry-record.js";
import { buildFinancialStatementsDocument } from "./financial-statements-print.js";
import { computeFsAggregate } from "./fs-data.js";
import { buildGeneralLedgerDocument } from "./general-ledger-print.js";
import { buildJournalDocument } from "./journal-print.js";

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

  it("renders ledgers for opening-only accounts with no current transactions", () => {
    const html = buildGeneralLedgerDocument("2026年分", [], [
      { accountId: "a:敷金<保証>", amount: 300_000 },
      { accountId: "l:元入金", amount: 300_000 },
    ]);

    expect(html.match(/class="bk-page"/g)).toHaveLength(2);
    expect(html).toContain("敷金&lt;保証&gt;");
    expect(html).not.toContain("敷金<保証>");
    expect(html).toContain("元入金");
    expect(html).toContain("前期繰越");
    expect(html).toContain("300,000");
    expect(html).not.toContain("仕訳データがありません");
  });

  it("keeps a contrary opening balance in the same account ledger", () => {
    const html = buildGeneralLedgerDocument(
      "2026年分",
      [
        entry({
          debit: "現金",
          debitType: "asset",
          debitAmount: "100,000",
        }),
      ],
      [{ accountId: "l:現金", amount: 50_000 }],
    );

    expect(html.match(/class="bk-page"/g)).toHaveLength(2);
    expect(html).not.toContain("現金（資産）");
    expect(html).not.toContain("現金（負債）");
    const openingRow = html.slice(
      html.indexOf("前期繰越"),
      html.indexOf("</tr>", html.indexOf("前期繰越")),
    );
    expect(openingRow).toContain("50,000");
    expect(openingRow.indexOf("50,000")).toBeGreaterThan(
      openingRow.indexOf("</td>", openingRow.indexOf("前期繰越")),
    );
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
          id: null,
          bookAccountId: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
          id: null,
          bookAccountId: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
          id: null,
          bookAccountId: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
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

  it("renders line-specific metadata in journal and ledger documents", () => {
    const compound = entry({
      partner: "誤ったヘッダー取引先",
      taxCategory: "誤ったヘッダー税区分",
      businessCategory: "誤ったヘッダー事業区分",
      lines: [
        {
          side: "debit",
          accountName: "通信費",
          accountType: "expense",
          amount: "60",
          partnerName: "通信会社A",
          taxCategoryName: "課税仕入 10%",
          businessCategoryName: "第5種",
          id: null,
          bookAccountId: null,
          taxCategoryId: null,
          businessCategoryId: null,
        },
        {
          side: "debit",
          accountName: "支払手数料",
          accountType: "expense",
          amount: "40",
          partnerName: "銀行B",
          taxCategoryName: "対象外",
          businessCategoryName: "対象外",
          id: null,
          bookAccountId: null,
          taxCategoryId: null,
          businessCategoryId: null,
        },
        {
          side: "credit",
          accountName: "普通預金",
          accountType: "asset",
          amount: "100",
          partnerName: "決済会社C",
          taxCategoryName: "非課税",
          businessCategoryName: "第2種",
          id: null,
          bookAccountId: null,
          taxCategoryId: null,
          businessCategoryId: null,
        },
      ],
    });

    const journalHtml = buildJournalDocument("2026年分", [compound]);
    expect(journalHtml).toContain("借: 通信会社A / 貸: 決済会社C");
    expect(journalHtml).toContain("借: 課税仕入 10% / 貸: 非課税");
    expect(journalHtml).toContain("取引先: 銀行B");
    expect(journalHtml).toContain("事業区分: 対象外");

    const ledgerHtml = buildGeneralLedgerDocument("2026年分", [compound], []);
    expect(ledgerHtml).toContain("取引先: 通信会社A");
    expect(ledgerHtml).toContain("取引先: 銀行B");
    expect(ledgerHtml).toContain("取引先: 決済会社C");
    expect(ledgerHtml).toContain("税区分: 課税仕入 10%");
    expect(ledgerHtml).toContain("事業区分: 第2種");
    expect(ledgerHtml).not.toContain("誤ったヘッダー取引先");
  });

  it("creates separate ledgers for same-name accounts with different IDs", () => {
    const html = buildGeneralLedgerDocument(
      "2026年分",
      [
        entry({
          id: "cost-bonus",
          lines: [
            {
              side: "debit",
              accountName: "賞与",
              accountType: "cost_of_sales",
              amount: "100",
              bookAccountId: "acct_cost_of_sales_賞与",
              id: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
            {
              side: "credit",
              accountName: "普通預金",
              accountType: "asset",
              amount: "100",
              bookAccountId: "acct_bank",
              id: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
          ],
        }),
        entry({
          id: "expense-bonus",
          lines: [
            {
              side: "debit",
              accountName: "賞与",
              accountType: "expense",
              amount: "200",
              bookAccountId: "acct_expense_賞与",
              id: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
            {
              side: "credit",
              accountName: "普通預金",
              accountType: "asset",
              amount: "200",
              bookAccountId: "acct_bank",
              id: null,
              partnerName: null,
              taxCategoryId: null,
              taxCategoryName: null,
              businessCategoryId: null,
              businessCategoryName: null,
            },
          ],
        }),
      ],
      [],
    );

    expect(html).toContain("賞与（売上原価）");
    expect(html).toContain("賞与（経費）");
  });

  it("paginates high-volume journals and ledgers without clipping rows", () => {
    const entries = Array.from({ length: 60 }, (_, index) =>
      entry({
        id: `entry-${index + 1}`,
        date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
        description: `row-${index + 1}`,
        lines: [
          {
            side: "debit",
            accountName: "通信費",
            accountType: "expense",
            amount: "100",
            bookAccountId: "acct_communication",
            id: null,
            partnerName: null,
            taxCategoryId: null,
            taxCategoryName: null,
            businessCategoryId: null,
            businessCategoryName: null,
          },
          {
            side: "credit",
            accountName: "普通預金",
            accountType: "asset",
            amount: "100",
            bookAccountId: "acct_bank",
            id: null,
            partnerName: null,
            taxCategoryId: null,
            taxCategoryName: null,
            businessCategoryId: null,
            businessCategoryName: null,
          },
        ],
      }),
    );

    const journalHtml = buildJournalDocument("2026年分", entries);
    const ledgerHtml = buildGeneralLedgerDocument("2026年分", entries, []);
    expect(journalHtml.match(/class="bk-page"/g)?.length).toBeGreaterThan(1);
    expect(ledgerHtml.match(/class="bk-page"/g)?.length).toBeGreaterThan(2);
    expect(journalHtml).toContain("row-60");
    expect(ledgerHtml).toContain("row-60");
    expect(journalHtml).not.toContain("overflow:hidden");
    expect(ledgerHtml).not.toContain("overflow:hidden");
  });

  it("splits a single oversized compound journal across pages", () => {
    const debitLines = Array.from({ length: 35 }, (_, index) => ({
      side: "debit" as const,
      accountName: `経費${index + 1}`,
      accountType: "expense" as const,
      amount: "1",
      id: null,
      bookAccountId: null,
      partnerName: null,
      taxCategoryId: null,
      taxCategoryName: null,
      businessCategoryId: null,
      businessCategoryName: null,
    }));
    const compound = entry({
      description: "35行の複合仕訳",
      lines: [
        ...debitLines,
        {
          side: "credit",
          accountName: "現金",
          accountType: "asset",
          amount: "35",
          id: null,
          bookAccountId: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
      ],
    });

    const html = buildJournalDocument("2026年分", [compound]);

    expect(html.match(/class="bk-page"/g)).toHaveLength(2);
    expect(html).toContain("経費35");
    expect(html.match(/35行の複合仕訳/g)).toHaveLength(1);
    expect(html.match(/1月分 合計/g)).toHaveLength(1);
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
      expenseWriteIns: [],
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
      openingBalanceLines: [
        { id: "a:普通預金", accountId: "a:普通預金", amount: 50_000 },
      ],
      entries: [entry({})],
    });
    const html = buildFinancialStatementsDocument({
      fpName: "2026年分",
      amounts: aggregate.amounts,
      bsRows: aggregate.bsRows,
      expenseWriteIns: [],
    });

    expect(html).toContain("<title>財務諸表</title>");
    expect(html).toContain("100,000");
    expect(html).toContain("150,000");
  });
});

function entry(overrides: EntryRecordOverrides): EntryRecord {
  return entryRecord(overrides, {
    date: "2026-01-15",
    debitAmount: "100,000",
    credit: "売上",
    creditType: "revenue",
    creditAmount: "100,000",
    description: "売上",
    partner: "取引先",
    taxCategory: "課税売上",
  });
}
