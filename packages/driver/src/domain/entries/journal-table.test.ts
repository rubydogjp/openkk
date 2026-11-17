import { describe, expect, it } from "vitest";

import type { SectionedBookAccount } from "./book-account.js";
import {
  entryLineValueDifferences,
  entrySharedLineValues,
  type EntryLine,
  type EntryRecord,
} from "./entry-record.js";
import {
  buildJournalTableEntryRows,
  buildJournalTableRows,
  diffJournalTableEntries,
  formatJournalTableCsv,
  parseJournalTableCsv,
  readJournalTableEntries,
  type JournalTableMaster,
} from "./journal-table.js";

const accounts: SectionedBookAccount[] = [
  {
    id: "acct_bank",
    name: "普通預金",
    accountType: "asset",
    balanceSheetSection: "current_asset",
  },
  {
    id: "acct_sales",
    name: "売上高",
    accountType: "revenue",
    balanceSheetSection: "none",
  },
  {
    id: "acct_withdrawal",
    name: "事業主貸",
    accountType: "equity",
    balanceSheetSection: "equity",
  },
  {
    id: "acct_supplies",
    name: "消耗品費",
    accountType: "expense",
    balanceSheetSection: "none",
  },
  {
    id: "acct_cos_supplies",
    name: "消耗品費",
    accountType: "cost_of_sales",
    balanceSheetSection: "none",
  },
  {
    id: "acct_allowance_current",
    name: "貸倒引当金",
    accountType: "asset",
    balanceSheetSection: "current_asset",
  },
  {
    id: "acct_allowance_fixed",
    name: "貸倒引当金",
    accountType: "asset",
    balanceSheetSection: "fixed_asset",
  },
];

const master: JournalTableMaster = {
  accounts,
  otherAccounts: [],
  taxCategories: [
    { id: "tax_out_of_scope", name: "対象外" },
    { id: "tax_purchase_10", name: "課税仕入 10%" },
  ],
  businessCategories: [
    { id: "biz_none", name: "対象外" },
    { id: "biz_5", name: "第5種" },
  ],
};

const period = {
  fiscalPeriodId: "fp-1",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  master,
  storedTexts: new Set<string>(),
};

function line(
  side: EntryLine["side"],
  accountId: string,
  amount: number,
  overrides: Partial<EntryLine> = {},
): EntryLine {
  const account = accounts.find((candidate) => candidate.id === accountId)!;
  return {
    id: null,
    side,
    accountName: account.name,
    accountType: account.accountType,
    amount: amount.toLocaleString("ja-JP"),
    bookAccountId: account.id,
    partnerName: null,
    taxCategoryId: "tax_out_of_scope",
    taxCategoryName: "対象外",
    businessCategoryId: "biz_none",
    businessCategoryName: "対象外",
    ...overrides,
  };
}

function stored(
  id: string,
  lines: EntryLine[],
  overrides: Partial<EntryRecord> = {},
): EntryRecord {
  return {
    id,
    localId: null,
    fiscalPeriodId: "fp-1",
    date: "2026-04-25",
    weekday: "土",
    description: "報酬の入金",
    businessRate: 1,
    lines,
    ...overrides,
  };
}

const reward = stored("e-reward", [
  line("debit", "acct_bank", 89790, { partnerName: "△△社" }),
  line("credit", "acct_sales", 100000, { partnerName: "△△社" }),
  line("debit", "acct_withdrawal", 10210, { partnerName: "△△社" }),
]);
const supplies = stored(
  "e-supplies",
  [
    line("debit", "acct_supplies", 12000, {
      taxCategoryId: "tax_purchase_10",
      taxCategoryName: "課税仕入 10%",
    }),
    line("credit", "acct_bank", 12000, {
      taxCategoryId: "tax_purchase_10",
      taxCategoryName: "課税仕入 10%",
    }),
  ],
  {
    localId: "s-1",
    date: "2026-05-10",
    description: "=プリンタのインク",
    businessRate: 0.8,
  },
);

function readCsv(text: string) {
  return readJournalTableEntries(parseJournalTableCsv(text), period);
}

function readEntries(text: string): EntryRecord[] {
  const result = readCsv(text);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.entries;
}

function problemsOf(text: string) {
  const result = readCsv(text);
  return result.ok ? [] : result.problems;
}

const HEADER =
  "仕訳番号,日付,借方科目,借方金額,貸方科目,貸方金額,摘要,取引先,税区分,事業区分,事業割合";
const WRITTEN_HEADER =
  "日付,借方科目,借方金額,貸方科目,貸方金額,摘要,取引先,税区分,事業区分,事業割合,仕訳番号";

describe("buildJournalTableEntryRows", () => {
  it("keeps the id of the entry each row came from, even when two entries share an entry number", () => {
    const copy = { ...supplies, id: "e-copy", localId: supplies.id };

    expect(
      buildJournalTableEntryRows([reward, supplies, copy], master).map(
        ({ entryId, row }) => [entryId, row.entryNumber],
      ),
    ).toEqual([
      ["e-reward", "e-reward"],
      ["e-reward", "e-reward"],
      [supplies.id, supplies.localId ?? supplies.id],
      ["e-copy", supplies.id],
    ]);
  });
});

describe("buildJournalTableRows", () => {
  it("writes one row per debit and credit pair with plain values", () => {
    expect(buildJournalTableRows([reward, supplies], master)).toEqual([
      {
        entryNumber: "e-reward",
        date: "2026-04-25",
        debitAccount: "普通預金",
        debitAmount: "89790",
        creditAccount: "売上高",
        creditAmount: "100000",
        description: "報酬の入金",
        partner: "△△社",
        taxCategory: "対象外",
        businessCategory: "対象外",
        businessRate: "100",
      },
      {
        entryNumber: "e-reward",
        date: "2026-04-25",
        debitAccount: "事業主貸",
        debitAmount: "10210",
        creditAccount: "",
        creditAmount: "",
        description: "報酬の入金",
        partner: "△△社",
        taxCategory: "対象外",
        businessCategory: "対象外",
        businessRate: "100",
      },
      {
        entryNumber: "s-1",
        date: "2026-05-10",
        debitAccount: "消耗品費",
        debitAmount: "12000",
        creditAccount: "普通預金",
        creditAmount: "12000",
        description: "=プリンタのインク",
        partner: "",
        taxCategory: "課税仕入 10%",
        businessCategory: "対象外",
        businessRate: "80",
      },
    ]);
  });

  it("tells same-name accounts apart and leaves out generated entries", () => {
    const rows = buildJournalTableRows(
      [
        stored("e-cos", [
          line("debit", "acct_cos_supplies", 500),
          line("credit", "acct_allowance_fixed", 500),
        ]),
        stored(
          "e-virtual",
          [line("debit", "acct_bank", 1), line("credit", "acct_sales", 1)],
          { localId: "virtual:closing" },
        ),
      ],
      master,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      debitAccount: "消耗品費（売上原価）",
      creditAccount: "貸倒引当金（固定資産）",
    });
  });
});

describe("one partner and category per entry", () => {
  const mixed = stored("e-mixed", [
    line("debit", "acct_bank", 900, { partnerName: null }),
    line("credit", "acct_sales", 1000, {
      partnerName: "△△社",
      taxCategoryId: "tax_purchase_10",
      taxCategoryName: "課税仕入 10%",
    }),
    line("debit", "acct_supplies", 100, { partnerName: "銀行" }),
  ]);

  it("writes the entry's first filled partner and the first category other than 対象外 on every row", () => {
    expect(
      buildJournalTableRows([mixed], master).map((row) => [
        row.partner,
        row.taxCategory,
        row.businessCategory,
      ]),
    ).toEqual([
      ["△△社", "課税仕入 10%", "対象外"],
      ["△△社", "課税仕入 10%", "対象外"],
    ]);
  });

  it("reads its own rows back as an entry whose lines all agree", () => {
    const [read] = readEntries(
      formatJournalTableCsv(buildJournalTableRows([mixed], master)),
    );

    expect(
      read?.lines.map((item) => [
        item.partnerName,
        item.taxCategoryId,
        item.businessCategoryId,
      ]),
    ).toEqual([
      ["△△社", "tax_purchase_10", "biz_none"],
      ["△△社", "tax_purchase_10", "biz_none"],
      ["△△社", "tax_purchase_10", "biz_none"],
    ]);
  });
});

describe("entry line values that differ", () => {
  it("prefers a category other than 対象外 even on a later line and names the fields that differ", () => {
    const entry = stored("e-old", [
      line("debit", "acct_bank", 1000),
      line("credit", "acct_sales", 1000, {
        taxCategoryId: "tax_purchase_10",
        taxCategoryName: "課税仕入 10%",
      }),
    ]);

    expect(entrySharedLineValues(entry)).toMatchObject({
      taxCategoryId: "tax_purchase_10",
      businessCategoryId: "biz_none",
    });
    expect(entryLineValueDifferences(entry)).toEqual(["税区分"]);
    expect(entryLineValueDifferences(reward)).toEqual([]);
  });

  it("keeps 対象外 when no line has another value", () => {
    expect(entrySharedLineValues(reward)).toMatchObject({
      taxCategoryId: "tax_out_of_scope",
      businessCategoryId: "biz_none",
    });
  });
});

describe("journal table CSV", () => {
  it("reads back what it writes, including compound entries", () => {
    const csv = formatJournalTableCsv(
      buildJournalTableRows([reward, supplies], master),
    );

    expect(csv.startsWith(`﻿${WRITTEN_HEADER}\n`)).toBe(true);
    expect(csv).toContain("'=プリンタのインク");
    const entries = readEntries(csv);
    expect(entries.map((entry) => entry.localId)).toEqual(["e-reward", "s-1"]);
    expect(
      entries[0]!.lines.map((item) => [
        item.side,
        item.bookAccountId,
        item.amount,
      ]),
    ).toEqual([
      ["debit", "acct_bank", "89,790"],
      ["credit", "acct_sales", "100,000"],
      ["debit", "acct_withdrawal", "10,210"],
    ]);
    expect(entries[1]).toMatchObject({
      description: "=プリンタのインク",
      businessRate: 0.8,
    });
    expect(entries[1]!.lines[0]).toMatchObject({
      taxCategoryId: "tax_purchase_10",
      businessCategoryId: "biz_none",
    });
  });

  it("finds columns by name, ignores extra columns and blank rows, and keeps quoted text", () => {
    const csv = [
      "メモ,摘要,日付,借方科目,借方金額,貸方科目,貸方金額",
      'x,"文具, ""A4""\r\n2 冊",2026-06-01,消耗品費,1000,普通預金,1000',
      ",,,,,,",
    ].join("\r\n");

    const entries = readEntries(csv);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      localId: null,
      description: '文具, "A4"\r\n2 冊',
      businessRate: 1,
    });
  });

  it("makes each row without an entry number its own new entry", () => {
    const entries = readEntries(
      [
        HEADER,
        ",2026-06-01,消耗品費,1000,普通預金,1000,文具,,,,",
        ",2026-06-02,消耗品費,2000,普通預金,2000,文具,,,,",
      ].join("\n"),
    );

    expect(entries.map((entry) => [entry.localId, entry.date])).toEqual([
      [null, "2026-06-01"],
      [null, "2026-06-02"],
    ]);
  });

  it("asks for the missing columns and refuses the previous CSV format", () => {
    expect(() => parseJournalTableCsv("日付,借方科目\n")).toThrow(
      /missing columns: 借方金額, 貸方科目, 貸方金額/,
    );
    expect(() =>
      parseJournalTableCsv("localId,date,debit,credit\n1,2026-01-01,a,b"),
    ).toThrow(/previous format/);
    expect(() => parseJournalTableCsv(`${HEADER}\n"unterminated`)).toThrow(
      /unterminated quoted field/,
    );
  });
});

describe("journal table dates", () => {
  it("reads the year-first dates a spreadsheet writes when it saves the CSV", () => {
    const entries = readEntries(
      [
        HEADER,
        "a,2026/6/1,消耗品費,1000,普通預金,1000,文具,,,,",
        "b,2026/06/02,消耗品費,1000,普通預金,1000,文具,,,,",
        "c,2026-6-3,消耗品費,1000,普通預金,1000,文具,,,,",
        "d,2026/6/4,消耗品費,1000,普通預金,1000,文具,,,,",
        "d,2026-06-04,消耗品費,500,普通預金,500,文具,,,,",
      ].join("\n"),
    );

    expect(entries.map((entry) => entry.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
  });

  it("still refuses a day that does not exist and a day-first date", () => {
    expect(
      problemsOf(
        [
          HEADER,
          "a,2026/2/30,消耗品費,1000,普通預金,1000,文具,,,,",
          "b,1/6/2026,消耗品費,1000,普通預金,1000,文具,,,,",
        ].join("\n"),
      ).map((problem) => problem.rowNumber),
    ).toEqual([2, 3]);
  });
});

describe("readJournalTableEntries problems", () => {
  it("lists the first problems and still counts all of them", () => {
    const result = readCsv(
      [
        HEADER,
        ...Array.from(
          { length: 150 },
          (_, index) => `x${index},2026-06-01,消耗品,1000,普通預金,1000,,,,,`,
        ),
      ].join("\n"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(100);
    expect(result.problemCount).toBe(150);
  });

  it("reports every row that cannot become an entry, with its row number", () => {
    const problems = problemsOf(
      [
        HEADER,
        "a,2026-06-01,消耗品,1000,普通預金,1000,,,,,",
        "b,2026-06-01,貸倒引当金,1000,普通預金,1000,,,,,",
        "c,2026-06-01,消耗品費,-5,普通預金,-5,,,,,",
        "d,2026-06-01,消耗品費,1000,普通預金,900,,,,,",
        "e,2027-01-01,消耗品費,1000,普通預金,1000,,,,,",
        "f,2026-06-01,消耗品費,1000,普通預金,1000,文具,,,,",
        "f,2026-06-02,消耗品費,1000,普通預金,1000,文具,,,,",
        "g,2026-06-01,,,,,,,,,",
        "h,2026-06-01,消耗品費,1000,普通預金,1000,,,課税 99%,,",
        "i,2026-06-01,消耗品費,1000,普通預金,1000,,,,,120",
      ].join("\n"),
    );

    expect(problems).toEqual([
      { rowNumber: 2, message: "借方: 勘定科目「消耗品」が見つかりません" },
      {
        rowNumber: 3,
        message:
          "借方: 勘定科目「貸倒引当金」が 2 つあります。「貸倒引当金（流動資産）」か「貸倒引当金（固定資産）」と書いてください",
      },
      {
        rowNumber: 4,
        message: "借方金額「-5」は 1 以上の整数で入れてください",
      },
      {
        rowNumber: 4,
        message: "貸方金額「-5」は 1 以上の整数で入れてください",
      },
      {
        rowNumber: 5,
        message: "借方の合計 1,000 と貸方の合計 900 が合いません",
      },
      {
        rowNumber: 6,
        message:
          "日付 2027-01-01 が会計期間 (2026-01-01 〜 2026-12-31) の外です",
      },
      {
        rowNumber: 8,
        message: "仕訳番号「f」の行で、日付・摘要・事業割合がそろっていません",
      },
      { rowNumber: 9, message: "借方か貸方の科目と金額を入れてください" },
      { rowNumber: 10, message: "摘要を入れてください" },
      {
        rowNumber: 11,
        message:
          "事業割合「120」は 0 から 100 の数で入れてください (80% なら 80)",
      },
    ]);
  });

  it("takes only plain amounts and percent rates, and does not read 0.8 as 0.8%", () => {
    const problems = problemsOf(
      [
        HEADER,
        "a,2026-06-01,消耗品費,1e3,普通預金,1e3,文具,,,,",
        "b,2026-06-01,消耗品費,0x10,普通預金,0x10,文具,,,,",
        "c,2026-06-01,消耗品費,1.000,普通預金,1.000,文具,,,,",
        "d,2026-06-01,消耗品費,1000,普通預金,1000,文具,,,,0.8",
        "e,2026-06-01,消耗品費,1000,普通預金,1000,文具,,,,1e1",
      ].join("\n"),
    );
    expect([...new Set(problems.map((problem) => problem.rowNumber))]).toEqual([
      2, 3, 4, 5, 6,
    ]);
    const [entry] = readEntries(
      [
        HEADER,
        'g,2026-06-01,消耗品費,"1,234,567",普通預金,1234567,文具,,,,80%',
      ].join("\n"),
    );
    expect(entry?.lines[0]?.amount).toBe("1,234,567");
    expect(entry?.businessRate).toBe(0.8);
  });

  it("refuses a table that has the same column twice", () => {
    expect(() => parseJournalTableCsv(`${HEADER},摘要\n`)).toThrow(
      "journal CSV has the column 摘要 twice",
    );
  });

  it("keeps a row without an entry number apart from an entry numbered like the internal key", () => {
    const entries = readEntries(
      [
        HEADER,
        ",2026-06-01,消耗品費,100,普通預金,100,番号なし,,,,",
        "row:2,2026-06-02,消耗品費,200,普通預金,200,番号あり,,,,",
      ].join("\n"),
    );
    expect(entries.map((entry) => entry.description)).toEqual([
      "番号なし",
      "番号あり",
    ]);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
  });

  it("asks for a description and keeps texts within the length the records take", () => {
    const tooLong = "あ".repeat(401);
    expect(
      problemsOf(
        [
          HEADER,
          "a,2026-06-01,消耗品費,1000,普通預金,1000,,,,,",
          `b,2026-06-01,消耗品費,1000,普通預金,1000,${tooLong},,,,`,
          `c,2026-06-01,消耗品費,1000,普通預金,1000,文具,${tooLong},,,`,
        ].join("\n"),
      ),
    ).toEqual([
      { rowNumber: 2, message: "摘要を入れてください" },
      { rowNumber: 3, message: "摘要は 400 文字までです" },
      { rowNumber: 4, message: "取引先は 400 文字までです" },
    ]);
  });

  it("takes a longer text that the period already holds", () => {
    const stored = "あ".repeat(401);
    const result = readJournalTableEntries(
      parseJournalTableCsv(
        [
          HEADER,
          `a,2026-06-01,消耗品費,1000,普通預金,1000,${stored},${stored},,,`,
        ].join("\n"),
      ),
      { ...period, storedTexts: new Set([stored]) },
    );

    expect(result.ok).toBe(true);
  });

  it("asks to split an entry whose rows differ in partner, tax category or business category", () => {
    expect(
      problemsOf(
        [
          HEADER,
          "a,2026-06-01,普通預金,900,売上高,1000,入金,△△社,,,",
          "a,2026-06-01,事業主貸,100,,,入金,銀行,,,",
          "b,2026-06-02,普通預金,300,売上高,500,入金,,課税仕入 10%,,",
          "b,2026-06-02,事業主貸,200,,,入金,,,第5種,",
          "c,2026-06-03,普通預金,300,売上高,500,入金,,,対象外,",
          "c,2026-06-03,事業主貸,200,,,入金,,対象外,,",
        ].join("\n"),
      ),
    ).toEqual([
      {
        rowNumber: 3,
        message:
          "仕訳番号「a」の行で、取引先・税区分・事業区分がそろっていません。違うときは別の仕訳に分けてください",
      },
      {
        rowNumber: 5,
        message:
          "仕訳番号「b」の行で、取引先・税区分・事業区分がそろっていません。違うときは別の仕訳に分けてください",
      },
    ]);
  });

  it("does not take entry numbers reserved for generated entries", () => {
    expect(
      problemsOf(
        [HEADER, "virtual:x,2026-06-01,消耗品費,1,普通預金,1,,,,,"].join("\n"),
      ),
    ).toEqual([{ rowNumber: 2, message: "仕訳番号「virtual:x」は使えません" }]);
  });
});

describe("diffJournalTableEntries", () => {
  const current = [reward, supplies];

  it("matches rows by entry number and sorts them into added, changed and removed", () => {
    const rows = buildJournalTableRows(current, master);
    rows[2] = { ...rows[2]!, debitAmount: "13000", creditAmount: "13000" };
    rows.splice(0, 2);
    rows.push({
      ...rows[0]!,
      entryNumber: "",
      date: "2026-07-01",
      description: "新しい仕訳",
    });
    const incoming = readEntries(formatJournalTableCsv(rows));

    const changes = diffJournalTableEntries(current, incoming, master);

    expect(changes.added.map((entry) => entry.description)).toEqual([
      "新しい仕訳",
    ]);
    expect(changes.changed.map(({ current: before }) => before.id)).toEqual([
      "e-supplies",
    ]);
    expect(changes.changed[0]!.next.lines[0]!.amount).toBe("13,000");
    expect(changes.removed.map((entry) => entry.id)).toEqual(["e-reward"]);
    expect(changes.unchangedCount).toBe(0);
  });

  it("writes a category outside the list as custom and reads it back unchanged", () => {
    const custom = stored("e-custom", [
      line("debit", "acct_supplies", 1000, {
        taxCategoryId: "課税10%",
        taxCategoryName: "カスタム(課税10%)",
        businessCategoryId: "うちの区分",
        businessCategoryName: "カスタム(うちの区分)",
      }),
      line("credit", "acct_bank", 1000, {
        taxCategoryId: "課税10%",
        taxCategoryName: "カスタム(課税10%)",
        businessCategoryId: "うちの区分",
        businessCategoryName: "カスタム(うちの区分)",
      }),
    ]);
    const csv = formatJournalTableCsv(buildJournalTableRows([custom], master));

    expect(csv).toContain(",カスタム(課税10%),カスタム(うちの区分),");
    const incoming = readEntries(csv);
    expect(
      incoming[0]!.lines.map((item) => [
        item.taxCategoryId,
        item.businessCategoryId,
      ]),
    ).toEqual([
      ["課税10%", "うちの区分"],
      ["課税10%", "うちの区分"],
    ]);
    expect(diffJournalTableEntries([custom], incoming, master)).toMatchObject({
      added: [],
      changed: [],
      removed: [],
      unchangedCount: 1,
    });
    expect(
      readEntries(csv.replaceAll("カスタム(課税10%)", "課税10%"))[0]!.lines[0],
    ).toMatchObject({
      taxCategoryId: "課税10%",
      taxCategoryName: "カスタム(課税10%)",
    });
  });

  it("does not count an entry as changed when its text starts with an apostrophe or a formula sign", () => {
    const quoted = [
      stored(
        "e-quoted",
        [
          line("debit", "acct_supplies", 1000),
          line("credit", "acct_bank", 1000),
        ],
        { description: "'=SUM(A1)" },
      ),
      stored(
        "e-full-width",
        [line("debit", "acct_supplies", 500), line("credit", "acct_bank", 500)],
        { description: "＝全角で始まる摘要" },
      ),
    ];
    const incoming = readEntries(
      formatJournalTableCsv(buildJournalTableRows(quoted, master)),
    );

    expect(incoming.map((entry) => entry.description)).toEqual([
      "'=SUM(A1)",
      "＝全角で始まる摘要",
    ]);
    expect(diffJournalTableEntries(quoted, incoming, master)).toMatchObject({
      added: [],
      changed: [],
      removed: [],
      unchangedCount: 2,
    });
  });

  it("leaves an untouched entry alone even when the table cannot show all of it", () => {
    const mixed = stored("e-mixed", [
      line("debit", "acct_supplies", 300, {
        taxCategoryId: "tax_purchase_10",
        taxCategoryName: "課税仕入 10%",
      }),
      line("credit", "acct_bank", 300),
    ]);
    const generated = stored(
      "e-generated",
      [line("debit", "acct_bank", 1), line("credit", "acct_sales", 1)],
      { localId: "virtual:closing" },
    );
    const incoming = readEntries(
      formatJournalTableCsv(buildJournalTableRows([mixed], master)),
    );

    const changes = diffJournalTableEntries(
      [mixed, generated],
      incoming,
      master,
    );

    expect(changes).toEqual({
      added: [],
      changed: [],
      removed: [],
      unchangedCount: 1,
    });
  });
});

describe("accounts outside the period's version of accounts and categories", () => {
  const retired: SectionedBookAccount = {
    id: "acct_retired_fee",
    name: "旧手数料",
    accountType: "expense",
    balanceSheetSection: "none",
  };
  const withRetired: JournalTableMaster = {
    ...master,
    otherAccounts: [retired],
  };
  const fee = stored("e-fee", [
    {
      ...line("debit", "acct_supplies", 500),
      accountName: retired.name,
      accountType: retired.accountType,
      bookAccountId: retired.id,
    },
    line("credit", "acct_bank", 500),
  ]);
  const readWithRetired = (text: string) => {
    const result = readJournalTableEntries(parseJournalTableCsv(text), {
      ...period,
      master: withRetired,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    return result.entries;
  };

  it("writes such an account as custom and reads it back unchanged", () => {
    const csv = formatJournalTableCsv(
      buildJournalTableRows([fee], withRetired),
    );

    expect(csv).toContain(",カスタム(旧手数料),500,普通預金,500,");
    const incoming = readWithRetired(csv);
    expect(incoming[0]!.lines.map((item) => item.bookAccountId)).toEqual([
      "acct_retired_fee",
      "acct_bank",
    ]);
    expect(diffJournalTableEntries([fee], incoming, withRetired)).toMatchObject(
      { added: [], changed: [], removed: [], unchangedCount: 1 },
    );
  });

  it("takes the plain name of an account another version has", () => {
    const csv = formatJournalTableCsv(
      buildJournalTableRows([fee], withRetired),
    ).replace("カスタム(旧手数料)", "旧手数料");

    expect(readWithRetired(csv)[0]!.lines[0]).toMatchObject({
      bookAccountId: "acct_retired_fee",
      accountName: "旧手数料",
      accountType: "expense",
    });
  });

  it("still refuses an account no version has", () => {
    const csv = formatJournalTableCsv(
      buildJournalTableRows([fee], withRetired),
    ).replace("カスタム(旧手数料)", "カスタム(どこにもない科目)");

    expect(
      readJournalTableEntries(parseJournalTableCsv(csv), {
        ...period,
        master: withRetired,
      }),
    ).toMatchObject({
      ok: false,
      problems: [
        {
          message:
            "借方: 勘定科目「カスタム(どこにもない科目)」が見つかりません",
        },
      ],
    });
  });
});
