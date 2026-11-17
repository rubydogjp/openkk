import { describe, expect, it } from "vitest";

import {
  entryRecord,
  type EntryRecordOverrides,
} from "../../../test-support/entry-record.js";
import type { EntryRecord } from "../entries/entry-record.js";
import { buildFinancialStatementsDocument } from "./financial-statements-print.js";
import { computeFsAggregate } from "./fs-data.js";
import { buildGeneralLedgerDocument } from "./general-ledger-print.js";
import { buildJournalDocument } from "./journal-print.js";
import { buildPrintHeading } from "./print-heading.js";
import { buildFiscalPeriodReport } from "./fiscal-period-reports.js";

const PROVISIONAL_HEADING = buildPrintHeading({
  fiscalPeriodName: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  preparedOn: new Date(2026, 11, 28),
  provisional: true,
});

const FINAL_HEADING = buildPrintHeading({
  fiscalPeriodName: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  preparedOn: new Date(2027, 1, 10),
  provisional: false,
});

describe("print documents", () => {
  it("prints the period, the date it was made and 決算前 on every page of a provisional report only", () => {
    const entries = Array.from({ length: 60 }, (_, index) =>
      entry({
        id: `heading-${index + 1}`,
        date: "2026-03-10",
        description: `ヘッダーの確かめ ${index + 1}`,
      }),
    );
    const provisionalPages = buildJournalDocument(entries, PROVISIONAL_HEADING)
      .split('class="bk-page"')
      .slice(1);
    const finalHtml = buildGeneralLedgerDocument(entries, [], FINAL_HEADING);
    const fsHtml = buildFinancialStatementsDocument(
      computeFsAggregate({ entries, openingBalanceLines: [] }),
      PROVISIONAL_HEADING,
    );

    expect(provisionalPages.length).toBeGreaterThan(1);
    for (const page of provisionalPages) {
      expect(page).toContain("2026年分 (2026/01/01〜2026/12/31)");
      expect(page).toContain("作成日 2026/12/28");
      expect(page).toContain(">決算前<");
    }
    expect(finalHtml).toContain("作成日 2027/02/10");
    expect(finalHtml).not.toContain("決算前");
    expect(fsHtml.match(/>決算前</g)).toHaveLength(2);
  });

  it("shortens a very long period name in the heading", () => {
    const heading = buildPrintHeading({
      fiscalPeriodName: "あ".repeat(40),
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      preparedOn: new Date(2026, 0, 5),
      provisional: false,
    });

    expect(heading.periodLabel).toBe(
      `${"あ".repeat(29)}… (2026/01/01〜2026/12/31)`,
    );
  });

  it("marks a report as 決算前 until the period is closed for good", () => {
    const report = (phase: "journalizing" | "pre_closing" | "post_closing") =>
      buildFiscalPeriodReport(
        "journal",
        {
          fiscalPeriod: {
            id: "fp-1",
            name: "2026年分",
            phase,
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            opening: { balanceLines: [] },
          },
          entries: [entry({})],
          assets: [],
          carryovers: [],
        },
        new Date(2027, 1, 10),
      );

    expect(report("journalizing")).toContain(">決算前<");
    expect(report("pre_closing")).toContain(">決算前<");
    expect(report("post_closing")).not.toContain("決算前");
    expect(report("post_closing")).toContain("作成日 2027/02/10");
  });

  it("shows on which side each ledger balance stands", () => {
    const html = buildGeneralLedgerDocument(
      [
        entry({
          debit: "普通預金",
          debitType: "asset",
          debitAmount: "30,000",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "30,000",
        }),
        entry({
          date: "2026-02-01",
          debit: "仮払金",
          debitType: "asset",
          debitAmount: "80,000",
          credit: "普通預金",
          creditType: "asset",
          creditAmount: "80,000",
        }),
      ],
      [],
      FINAL_HEADING,
    );
    const bankPage = html
      .split('class="bk-page"')
      .find((page) => page.includes(">普通預金</div>"))!;
    const balanceCells = [
      ...bankPage.matchAll(
        /text-align:center">(借|貸|)<\/td>\s*<td[^>]*text-align:right">([\d,]+)<\/td>/g,
      ),
    ].map((match) => [match[1], match[2]]);

    expect(bankPage).toContain(">借/貸</th>");
    expect(balanceCells).toEqual([
      ["借", "30,000"],
      ["貸", "50,000"],
    ]);
  });

  it("renders journal data from supplied entries and escapes HTML", () => {
    const html = buildJournalDocument(
      [
        entry({
          date: "2026-01-15<script>",
          description: "売上 <確認>",
          partner: "A&B",
        }),
      ],
      FINAL_HEADING,
    );

    expect(html).toContain("<title>仕訳帳</title>");
    expect(html).toContain("2026/01/15&lt;script&gt;");
    expect(html).toContain("売上 &lt;確認&gt;");
    expect(html).toContain("A&amp;B");
    expect(html).toContain("100,000");
  });

  it("renders general ledger balances from supplied entries and opening balances", () => {
    const html = buildGeneralLedgerDocument(
      [entry({})],
      [{ accountId: "a:普通預金", amount: 50_000 }],
      FINAL_HEADING,
    );

    expect(html).toContain("<title>総勘定元帳</title>");
    expect(html).toContain("普通預金");
    expect(html).toContain("150,000");
    expect(html).toContain("前期繰越");
    expect(html).toContain("50,000");
  });

  it("renders ledgers for opening-only accounts with no current transactions", () => {
    const html = buildGeneralLedgerDocument(
      [],
      [
        { accountId: "a:敷金<保証>", amount: 300_000 },
        { accountId: "l:元入金", amount: 300_000 },
      ],
      FINAL_HEADING,
    );

    expect(html.match(/class="bk-page"/g)).toHaveLength(2);
    expect(html).toContain("敷金&lt;保証&gt;");
    expect(html).not.toContain("敷金<保証>");
    expect(html).toContain("元入金");
    expect(html).toContain("前期繰越");
    expect(html).toContain("300,000");
    expect(html).not.toContain("仕訳データがありません");
  });

  it("tells apart ledgers of two accounts that share both name and type, and puts the year on each month", () => {
    const html = buildGeneralLedgerDocument(
      [
        entry({
          debit: "消耗品費",
          debitType: "expense",
          debitBookAccountId: "acct_supplies_a",
          debitAmount: "1,000",
          creditAmount: "1,000",
        }),
        entry({
          debit: "消耗品費",
          debitType: "expense",
          debitBookAccountId: "acct_supplies_b",
          debitAmount: "2,000",
          creditAmount: "2,000",
        }),
      ],
      [],
      FINAL_HEADING,
    );

    expect(html).toContain("消耗品費（1）");
    expect(html).toContain("消耗品費（2）");
    expect(html).toMatch(/\d{4}年\d{1,2}月分 合計/);
  });

  it("keeps a contrary opening balance in the same account ledger", () => {
    const html = buildGeneralLedgerDocument(
      [
        entry({
          debit: "現金",
          debitType: "asset",
          debitAmount: "100,000",
        }),
      ],
      [{ accountId: "l:現金", amount: 50_000 }],
      FINAL_HEADING,
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

    const journalHtml = buildJournalDocument([compound], FINAL_HEADING);
    expect(journalHtml).toContain("荷造運賃");
    expect(journalHtml).toContain("42,000");
    expect(journalHtml).toContain("210,000");

    const ledgerHtml = buildGeneralLedgerDocument(
      [compound],
      [],
      FINAL_HEADING,
    );
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

    const journalHtml = buildJournalDocument([compound], FINAL_HEADING);
    expect(journalHtml).toContain("借: 通信会社A / 貸: 決済会社C");
    expect(journalHtml).toContain("借: 課税仕入 10% / 貸: 非課税");
    expect(journalHtml).toContain("取引先: 銀行B");
    expect(journalHtml).toContain("事業区分: 対象外");

    const ledgerHtml = buildGeneralLedgerDocument(
      [compound],
      [],
      FINAL_HEADING,
    );
    expect(ledgerHtml).toContain("取引先: 通信会社A");
    expect(ledgerHtml).toContain("取引先: 銀行B");
    expect(ledgerHtml).toContain("取引先: 決済会社C");
    expect(ledgerHtml).toContain("税区分: 課税仕入 10%");
    expect(ledgerHtml).toContain("事業区分: 第2種");
    expect(ledgerHtml).not.toContain("誤ったヘッダー取引先");
  });

  it("creates separate ledgers for same-name accounts with different IDs", () => {
    const html = buildGeneralLedgerDocument(
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
      FINAL_HEADING,
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

    const journalHtml = buildJournalDocument(entries, FINAL_HEADING);
    const ledgerHtml = buildGeneralLedgerDocument(entries, [], FINAL_HEADING);
    expect(journalHtml.match(/class="bk-page"/g)?.length).toBeGreaterThan(1);
    expect(ledgerHtml.match(/class="bk-page"/g)?.length).toBeGreaterThan(2);
    expect(journalHtml).toContain("row-60");
    expect(ledgerHtml).toContain("row-60");
    expect(journalHtml).not.toContain("overflow:hidden");
    expect(ledgerHtml).not.toContain("overflow:hidden");
  });

  it("splits a busy month by the height its rows take, not by a fixed number of rows", () => {
    const entries = Array.from({ length: 24 }, (_, index) =>
      entry({
        id: `entry-${index + 1}`,
        date: "2026-09-05",
        description: `コピー用紙と文具の購入 ${index + 1}`,
        partner: "",
        taxCategory: "対象外",
        businessCategory: "対象外",
      }),
    );

    const pages = buildJournalDocument(entries, FINAL_HEADING)
      .split('class="bk-page"')
      .slice(1);

    expect(pages).toHaveLength(2);
    expect(pages[0]).not.toContain("9月分 合計");
    expect(pages[1]).toContain("9月分 合計");
    expect(pages.join("")).toContain("コピー用紙と文具の購入 24");
  });

  it("splits a ledger with long descriptions by the height its rows take", () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry({
        id: `entry-${index + 1}`,
        date: "2026-09-05",
        description: "長い摘要".repeat(40),
      }),
    );

    const ledgerHtml = buildGeneralLedgerDocument(entries, [], FINAL_HEADING);

    expect(ledgerHtml.match(/class="bk-page"/g)?.length).toBeGreaterThan(2);
  });

  it("splits a single oversized compound journal across pages", () => {
    const debitLines = Array.from({ length: 60 }, (_, index) => ({
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
      description: "60行の複合仕訳",
      lines: [
        ...debitLines,
        {
          side: "credit",
          accountName: "現金",
          accountType: "asset",
          amount: "60",
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

    const html = buildJournalDocument([compound], FINAL_HEADING);

    expect(html.match(/class="bk-page"/g)).toHaveLength(2);
    expect(html).toContain("経費60");
    expect(html.match(/60行の複合仕訳/g)).toHaveLength(1);
    expect(html.match(/1月分 合計/g)).toHaveLength(1);
  });

  it("normalises non-finite printed amounts to blanks", () => {
    const journalHtml = buildJournalDocument(
      [entry({ debitAmount: "Infinity", creditAmount: "-Infinity" })],
      FINAL_HEADING,
    );
    const ledgerHtml = buildGeneralLedgerDocument(
      [entry({ debitAmount: "Infinity", creditAmount: "-Infinity" })],
      [],
      FINAL_HEADING,
    );
    const fsHtml = buildFinancialStatementsDocument(
      {
        amounts: { 1: Infinity, 2: -Infinity },
        bsRows: [],
        expenseWriteIns: [],
      },
      FINAL_HEADING,
    );

    expect(journalHtml).not.toContain("Infinity");
    expect(ledgerHtml).not.toContain("Infinity");
    expect(fsHtml).not.toContain("Infinity");
  });

  it("does not render NaN month labels for malformed entry dates", () => {
    const malformedDateEntry = entry({ date: "not-a-date" });

    const journalHtml = buildJournalDocument(
      [malformedDateEntry],
      FINAL_HEADING,
    );
    const ledgerHtml = buildGeneralLedgerDocument(
      [malformedDateEntry],
      [],
      FINAL_HEADING,
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
    const html = buildFinancialStatementsDocument(
      {
        amounts: aggregate.amounts,
        bsRows: aggregate.bsRows,
        expenseWriteIns: [],
      },
      FINAL_HEADING,
    );

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
