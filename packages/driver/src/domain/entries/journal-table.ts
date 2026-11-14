import { AppError } from "../shared/app-error.js";
import {
  formatCsv,
  isBlankCsvRow,
  parseCsv,
  protectSpreadsheetFormula,
  stripByteOrderMark,
  unprotectSpreadsheetFormula,
} from "../shared/csv.js";
import {
  formatAmount,
  formatBusinessRatePercent,
  parseAmount,
  parseIsoLocalDate,
  weekdayJa,
} from "../shared/parse-utils.js";
import { MAX_TEXT_FIELD_LENGTH } from "../shared/text-limits.js";
import {
  buildBookAccountLabels,
  type SectionedBookAccount,
} from "./book-account.js";
import {
  assertEntryImportLineCount,
  assertEntryImportSize,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_LINES,
} from "./entry-limits.js";
import {
  entryRecordToImportPayload,
  type EntryInputRecord,
  type EntryLineMaster,
} from "./entry-input-mapping.js";
import {
  entryToVisualPairs,
  type EntryLine,
  type EntryRecord,
} from "./entry-record.js";
import { isMaterializedVirtualEntry } from "./virtual-entries.js";

export type JournalTableRow = {
  entryNumber: string;
  date: string;
  debitAccount: string;
  debitAmount: string;
  creditAccount: string;
  creditAmount: string;
  description: string;
  partner: string;
  taxCategory: string;
  businessCategory: string;
  businessRate: string;
};

export type JournalTableFileRow = JournalTableRow & { rowNumber: number };

export type JournalTableMaster = {
  accounts: ReadonlyArray<SectionedBookAccount>;
  taxCategories: ReadonlyArray<{ id: string; name: string }>;
  businessCategories: ReadonlyArray<{ id: string; name: string }>;
};

export type JournalTableProblem = { rowNumber: number; message: string };

export type JournalTableReadResult =
  | { ok: true; entries: EntryRecord[] }
  | { ok: false; problems: JournalTableProblem[] };

export type JournalTableChanges = {
  added: EntryRecord[];
  changed: Array<{ current: EntryRecord; next: EntryRecord }>;
  removed: EntryRecord[];
  unchangedCount: number;
};

export type JournalTableOperations = {
  removeIds: string[];
  updates: Array<{ id: string; input: EntryInputRecord }>;
  creates: EntryInputRecord[];
};

export const JOURNAL_TABLE_FIELDS = [
  "date",
  "debitAccount",
  "debitAmount",
  "creditAccount",
  "creditAmount",
  "description",
  "partner",
  "taxCategory",
  "businessCategory",
  "businessRate",
  "entryNumber",
] as const satisfies ReadonlyArray<keyof JournalTableRow>;

export const JOURNAL_TABLE_HEADERS: Record<keyof JournalTableRow, string> = {
  entryNumber: "仕訳番号",
  date: "日付",
  debitAccount: "借方科目",
  debitAmount: "借方金額",
  creditAccount: "貸方科目",
  creditAmount: "貸方金額",
  description: "摘要",
  partner: "取引先",
  taxCategory: "税区分",
  businessCategory: "事業区分",
  businessRate: "事業割合",
};

const REQUIRED_FIELDS: ReadonlyArray<keyof JournalTableRow> = [
  "date",
  "debitAccount",
  "debitAmount",
  "creditAccount",
  "creditAmount",
];
const COMPARED_FIELDS = JOURNAL_TABLE_FIELDS.filter(
  (field) => field !== "entryNumber",
);
const DEFAULT_TAX_CATEGORY_ID = "tax_out_of_scope";
const DEFAULT_BUSINESS_CATEGORY_ID = "biz_none";
const MAX_REPORTED_PROBLEMS = 100;

export function journalEntryNumber(entry: {
  id: string;
  localId: string | null;
}): string {
  return entry.localId ?? entry.id;
}

export function buildJournalTableRows(
  entries: ReadonlyArray<EntryRecord>,
  master: JournalTableMaster,
): JournalTableRow[] {
  const labels = buildBookAccountLabels(master.accounts);
  return entries
    .filter((entry) => !isMaterializedVirtualEntry(entry))
    .flatMap((entry) => entryRows(entry, labels));
}

function entryRows(
  entry: EntryRecord,
  labels: ReadonlyMap<string, string>,
): JournalTableRow[] {
  const accountLabel = (line: EntryLine | null) =>
    line == null
      ? ""
      : (labels.get(line.bookAccountId ?? "") ?? line.accountName);
  const amount = (line: EntryLine | null) =>
    line == null ? "" : String(parseAmount(line.amount));
  return entryToVisualPairs(entry).map((pair) => {
    const pick = (read: (line: EntryLine) => string | null) =>
      [pair.debit, pair.credit]
        .map((line) => (line == null ? "" : (read(line) ?? "")))
        .find((value) => value !== "") ?? "";
    return {
      entryNumber: journalEntryNumber(entry),
      date: entry.date,
      debitAccount: accountLabel(pair.debit),
      debitAmount: amount(pair.debit),
      creditAccount: accountLabel(pair.credit),
      creditAmount: amount(pair.credit),
      description: entry.description,
      partner: pick((line) => line.partnerName),
      taxCategory: pick((line) => line.taxCategoryName),
      businessCategory: pick((line) => line.businessCategoryName),
      businessRate: formatBusinessRatePercent(entry.businessRate),
    };
  });
}

export function formatJournalTableCsv(
  rows: ReadonlyArray<JournalTableRow>,
): string {
  return formatCsv([
    JOURNAL_TABLE_FIELDS.map((field) => JOURNAL_TABLE_HEADERS[field]),
    ...rows.map((row) =>
      JOURNAL_TABLE_FIELDS.map((field) =>
        protectSpreadsheetFormula(row[field]),
      ),
    ),
  ]);
}

export function parseJournalTableCsv(text: string): JournalTableFileRow[] {
  assertEntryImportSize(text.length);
  const [header = [], ...body] = parseCsv(stripByteOrderMark(text));
  const names = header.map((name) => name.trim());
  if (names.includes("localId")) {
    throw journalTableFileError(
      "journal CSV uses the previous format; read it with importEntriesFromLegacyCsv",
      "以前の形式のCSVです。",
    );
  }
  const columns = JOURNAL_TABLE_FIELDS.map((field) =>
    names.indexOf(JOURNAL_TABLE_HEADERS[field]),
  );
  const missing = REQUIRED_FIELDS.filter(
    (field) => columns[JOURNAL_TABLE_FIELDS.indexOf(field)] === -1,
  );
  if (missing.length > 0) {
    const headers = missing.map((field) => JOURNAL_TABLE_HEADERS[field]);
    throw journalTableFileError(
      `journal CSV is missing columns: ${headers.join(", ")}`,
      `CSVに「${headers.join("」「")}」の列がありません。1行目に列の名前を入れてください。`,
    );
  }
  const rows: JournalTableFileRow[] = [];
  body.forEach((cells, index) => {
    if (isBlankCsvRow(cells)) return;
    const cell = (field: keyof JournalTableRow) => {
      const column = columns[JOURNAL_TABLE_FIELDS.indexOf(field)] ?? -1;
      return column === -1
        ? ""
        : unprotectSpreadsheetFormula(cells[column] ?? "");
    };
    rows.push({
      rowNumber: index + 2,
      entryNumber: cell("entryNumber"),
      date: cell("date"),
      debitAccount: cell("debitAccount"),
      debitAmount: cell("debitAmount"),
      creditAccount: cell("creditAccount"),
      creditAmount: cell("creditAmount"),
      description: cell("description"),
      partner: cell("partner"),
      taxCategory: cell("taxCategory"),
      businessCategory: cell("businessCategory"),
      businessRate: cell("businessRate"),
    });
  });
  assertEntryImportLineCount(rows.length);
  return rows;
}

export function readJournalTableEntries(
  rows: ReadonlyArray<JournalTableFileRow>,
  input: {
    fiscalPeriodId: string;
    startDate: string;
    endDate: string;
    master: JournalTableMaster;
    storedTexts: ReadonlySet<string>;
  },
): JournalTableReadResult {
  const problems: JournalTableProblem[] = [];
  const report = (rowNumber: number, message: string) => {
    if (problems.length < MAX_REPORTED_PROBLEMS) {
      problems.push({ rowNumber, message });
    }
  };
  const exceedsTextLimit = (text: string) =>
    text.length > MAX_TEXT_FIELD_LENGTH && !input.storedTexts.has(text);
  const resolveAccount = createAccountResolver(input.master.accounts);
  const resolveTaxCategory = createCategoryResolver(
    input.master.taxCategories,
    DEFAULT_TAX_CATEGORY_ID,
    "税区分",
  );
  const resolveBusinessCategory = createCategoryResolver(
    input.master.businessCategories,
    DEFAULT_BUSINESS_CATEGORY_ID,
    "事業区分",
  );

  const groups = new Map<string, JournalTableFileRow[]>();
  for (const row of rows) {
    const entryNumber = row.entryNumber.trim();
    const key = entryNumber === "" ? `row:${row.rowNumber}` : entryNumber;
    const group = groups.get(key);
    if (group == null) groups.set(key, [row]);
    else group.push(row);
  }
  if (groups.size > MAX_ENTRY_IMPORT_ITEMS) {
    report(
      rows[0]?.rowNumber ?? 1,
      `仕訳は ${MAX_ENTRY_IMPORT_ITEMS} 件までです`,
    );
    return { ok: false, problems };
  }

  const entries: EntryRecord[] = [];
  for (const [key, group] of groups) {
    const first = group[0]!;
    const entryNumber = first.entryNumber.trim();
    if (isMaterializedVirtualEntry({ localId: entryNumber })) {
      report(first.rowNumber, `仕訳番号「${entryNumber}」は使えません`);
      continue;
    }
    const date = first.date.trim();
    if (parseIsoLocalDate(date) == null) {
      report(
        first.rowNumber,
        `日付「${first.date}」は 2026-04-01 の形で入れてください`,
      );
      continue;
    }
    if (date < input.startDate || date > input.endDate) {
      report(
        first.rowNumber,
        `日付 ${date} が会計期間 (${input.startDate} 〜 ${input.endDate}) の外です`,
      );
      continue;
    }
    const businessRate = parseTableBusinessRate(first.businessRate);
    if (businessRate == null) {
      report(
        first.rowNumber,
        `事業割合「${first.businessRate}」は 0 から 100 の数で入れてください`,
      );
      continue;
    }
    const mismatch = group.find(
      (row) =>
        row.date.trim() !== date ||
        row.description !== first.description ||
        parseTableBusinessRate(row.businessRate) !== businessRate,
    );
    if (mismatch != null) {
      report(
        mismatch.rowNumber,
        `仕訳番号「${entryNumber}」の行で、日付・摘要・事業割合がそろっていません`,
      );
      continue;
    }

    const lines: EntryLine[] = [];
    let valid = true;
    for (const row of group) {
      const partner = row.partner.trim();
      if (exceedsTextLimit(partner)) {
        report(row.rowNumber, `取引先は ${MAX_TEXT_FIELD_LENGTH} 文字までです`);
        valid = false;
        continue;
      }
      const taxCategory = resolveTaxCategory(row.taxCategory);
      const businessCategory = resolveBusinessCategory(row.businessCategory);
      if (
        typeof taxCategory === "string" ||
        typeof businessCategory === "string"
      ) {
        for (const message of [taxCategory, businessCategory]) {
          if (typeof message === "string") report(row.rowNumber, message);
        }
        valid = false;
        continue;
      }
      const sides = [
        { side: "debit", account: row.debitAccount, amount: row.debitAmount },
        {
          side: "credit",
          account: row.creditAccount,
          amount: row.creditAmount,
        },
      ] as const;
      let sideCount = 0;
      for (const { side, account, amount } of sides) {
        const sideLabel = side === "debit" ? "借方" : "貸方";
        if (account.trim() === "" && amount.trim() === "") continue;
        sideCount += 1;
        const resolved = resolveAccount(account.trim());
        if (typeof resolved === "string") {
          report(row.rowNumber, `${sideLabel}: ${resolved}`);
          valid = false;
          continue;
        }
        const parsedAmount = parseTableAmount(amount);
        if (parsedAmount == null) {
          report(
            row.rowNumber,
            `${sideLabel}金額「${amount}」は 1 以上の整数で入れてください`,
          );
          valid = false;
          continue;
        }
        lines.push({
          id: null,
          side,
          accountName: resolved.name,
          accountType: resolved.accountType,
          amount: formatAmount(parsedAmount),
          bookAccountId: resolved.id,
          partnerName: partner === "" ? null : partner,
          taxCategoryId: taxCategory.id,
          taxCategoryName: taxCategory.name,
          businessCategoryId: businessCategory.id,
          businessCategoryName: businessCategory.name,
        });
      }
      if (sideCount === 0) {
        report(row.rowNumber, "借方か貸方の科目と金額を入れてください");
        valid = false;
      }
    }
    if (!valid) continue;
    if (lines.length > MAX_ENTRY_LINES) {
      report(
        first.rowNumber,
        `1 つの仕訳の明細は ${MAX_ENTRY_LINES} 行までです`,
      );
      continue;
    }
    const total = (side: EntryLine["side"]) =>
      lines
        .filter((line) => line.side === side)
        .reduce((sum, line) => sum + parseAmount(line.amount), 0);
    const debitTotal = total("debit");
    const creditTotal = total("credit");
    if (debitTotal === 0 || creditTotal === 0) {
      report(first.rowNumber, "借方と貸方の両方を入れてください");
      continue;
    }
    if (debitTotal !== creditTotal) {
      report(
        first.rowNumber,
        `借方の合計 ${formatAmount(debitTotal)} と貸方の合計 ${formatAmount(creditTotal)} が合いません`,
      );
      continue;
    }
    if (first.description.trim() === "") {
      report(first.rowNumber, "摘要を入れてください");
      continue;
    }
    if (exceedsTextLimit(first.description)) {
      report(first.rowNumber, `摘要は ${MAX_TEXT_FIELD_LENGTH} 文字までです`);
      continue;
    }
    entries.push({
      id: `journal-table:${key}`,
      localId: entryNumber === "" ? null : entryNumber,
      fiscalPeriodId: input.fiscalPeriodId,
      date,
      weekday: weekdayJa(date),
      description: first.description,
      businessRate,
      lines,
    });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, entries };
}

export function diffJournalTableEntries(
  current: ReadonlyArray<EntryRecord>,
  incoming: ReadonlyArray<EntryRecord>,
  master: JournalTableMaster,
): JournalTableChanges {
  const labels = buildBookAccountLabels(master.accounts);
  const tableText = (entry: EntryRecord) =>
    JSON.stringify(
      entryRows(entry, labels).map((row) =>
        COMPARED_FIELDS.map((field) => row[field]),
      ),
    );
  const manual = current.filter((entry) => !isMaterializedVirtualEntry(entry));
  const currentByNumber = new Map(
    manual.map((entry) => [journalEntryNumber(entry), entry]),
  );
  const incomingNumbers = new Set<string>();
  const changes: JournalTableChanges = {
    added: [],
    changed: [],
    removed: [],
    unchangedCount: 0,
  };
  for (const next of incoming) {
    const existing =
      next.localId == null ? null : currentByNumber.get(next.localId);
    if (next.localId != null) incomingNumbers.add(next.localId);
    if (existing == null) {
      changes.added.push(next);
    } else if (tableText(existing) === tableText(next)) {
      changes.unchangedCount += 1;
    } else {
      changes.changed.push({ current: existing, next });
    }
  }
  changes.removed = manual.filter(
    (entry) => !incomingNumbers.has(journalEntryNumber(entry)),
  );
  return changes;
}

export function journalTableOperations(
  changes: JournalTableChanges,
  master: EntryLineMaster,
): JournalTableOperations {
  return {
    removeIds: changes.removed.map((entry) => entry.id),
    updates: changes.changed.map(({ current, next }) => ({
      id: current.id,
      input: {
        ...entryRecordToImportPayload(next, master),
        localId: current.localId,
      },
    })),
    creates: changes.added.map((entry) =>
      entryRecordToImportPayload(entry, master),
    ),
  };
}

function createAccountResolver(
  accounts: ReadonlyArray<SectionedBookAccount>,
): (text: string) => SectionedBookAccount | string {
  const labels = buildBookAccountLabels(accounts);
  const byLabel = new Map(
    accounts.map((account) => [
      labels.get(account.id) ?? account.name,
      account,
    ]),
  );
  return (text) => {
    if (text === "") return "科目を入れてください";
    const labeled = byLabel.get(text);
    if (labeled != null) return labeled;
    const named = accounts.filter((account) => account.name === text);
    if (named.length === 1) return named[0]!;
    if (named.length > 1) {
      const candidates = named.map(
        (account) => `「${labels.get(account.id) ?? account.name}」`,
      );
      return `勘定科目「${text}」が ${named.length} つあります。${candidates.join("か")}と書いてください`;
    }
    return `勘定科目「${text}」が見つかりません`;
  };
}

function createCategoryResolver(
  categories: ReadonlyArray<{ id: string; name: string }>,
  defaultId: string,
  label: string,
): (text: string) => { id: string; name: string } | string {
  return (text) => {
    const value = text.trim();
    const found =
      value === ""
        ? categories.find((category) => category.id === defaultId)
        : (categories.find((category) => category.name === value) ??
          categories.find((category) => category.id === value));
    if (found != null) return { id: found.id, name: found.name };
    return value === ""
      ? { id: defaultId, name: defaultId }
      : `${label}「${value}」が見つかりません`;
  };
}

function parseTableAmount(text: string): number | null {
  const value = Number(text.replaceAll(",", "").trim());
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseTableBusinessRate(text: string): number | null {
  const value = text.trim().replace(/%$/, "");
  if (value === "") return 1;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent / 100;
}

function journalTableFileError(
  messageForDeveloper: string,
  messageForUser: string,
): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser,
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
