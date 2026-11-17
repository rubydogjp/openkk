import {
  entryLineAccountKey,
  resolveEntryLineMetadata,
  type EntryLine,
  type EntryRecord,
} from "../entries/entry-record.js";
import type { BookAccountType } from "../entries/book-account.js";
import { formatAmount, parseAmount } from "../shared/parse-utils.js";
import { OPENING_EQUITY_LABELS } from "../shared/balance-sheet-layout.js";
import { buildPrintDocument, escapeHtml } from "./print-shell.js";
import { buildPortraitPage } from "./portrait-page.js";
import type { PrintHeading } from "./print-heading.js";
import {
  formatAmountOrBlank,
  formatMonthLabel,
  formatPrintDate,
} from "./print-format.js";
import { formatEntryMetadata } from "./entry-metadata.js";
import {
  estimateRowHeight,
  packItemsIntoPages,
  PORTRAIT_TABLE_HEIGHT_BUDGET,
  type PageItem,
  type PrintRowMetrics,
} from "./print-layout.js";

function formatBalance(balance: number): string {
  return formatAmount(Math.abs(balance));
}

function balanceSide(balance: number, debitNormal: boolean): string {
  if (balance === 0) return "";
  return balance > 0 === debitNormal ? "借" : "貸";
}

function isDebitNormal(type: BookAccountType): boolean {
  return type === "asset" || type === "expense" || type === "cost_of_sales";
}

function isBalanceSheetAccount(type: BookAccountType): boolean {
  return type === "asset" || type === "liability" || type === "equity";
}

const PREFERRED_LEDGER_ORDER = [
  "売上",
  "減価償却費",
  "地代家賃",
  "水道光熱費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "接待交際費",
  "消耗品費",
  "会議費",
  "工具器具備品",
  "事業主貸",
  "事業主借",
  "元入金",
];

const TABLE_WIDTH = 740;
const COLUMN_WIDTHS = {
  date: 75,
  counterAccount: 120,
  debitAmount: 68,
  creditAmount: 68,
  balanceSide: 24,
  balance: 81,
};
const MEMO_COLUMN_WIDTH =
  TABLE_WIDTH -
  COLUMN_WIDTHS.date -
  COLUMN_WIDTHS.counterAccount -
  COLUMN_WIDTHS.debitAmount -
  COLUMN_WIDTHS.creditAmount -
  COLUMN_WIDTHS.balanceSide -
  COLUMN_WIDTHS.balance;
const METADATA_COLUMN_WIDTH =
  COLUMN_WIDTHS.debitAmount +
  COLUMN_WIDTHS.creditAmount +
  COLUMN_WIDTHS.balanceSide +
  COLUMN_WIDTHS.balance;
const BAND_LABEL_COLUMN_WIDTH =
  COLUMN_WIDTHS.date + COLUMN_WIDTHS.counterAccount + MEMO_COLUMN_WIDTH;
const ROW_METRICS: PrintRowMetrics = { lineHeight: 12.5, verticalPadding: 8 };
const HEADER_ROW_HEIGHT = 24;
const HEADER_HEIGHT = HEADER_ROW_HEIGHT * 2 + 1;
const ROW_HEIGHT_BUDGET = PORTRAIT_TABLE_HEIGHT_BUDGET - HEADER_HEIGHT;

type LedgerLine = {
  date: string;
  counterAccount: string;
  memo: string;
  metadata: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
};

type AccountLedger = {
  accountKey: string;
  accountName: string;
  accountType: BookAccountType;
  openingBalance: number;
  debitNormal: boolean;
  lines: LedgerLine[];
  monthSubtotals: Map<string, { debit: number; credit: number }>;
};

type AccountIdentity = {
  key: string;
  name: string;
  type: BookAccountType;
};

function buildLedger(
  account: AccountIdentity,
  allEntries: EntryRecord[],
  openingBalance: number,
): AccountLedger {
  const relevant = allEntries
    .flatMap((entry) =>
      entry.lines
        .filter((line) => entryLineAccountKey(line) === account.key)
        .map((line) => ({ entry, line })),
    )
    .sort((left, right) => left.entry.date.localeCompare(right.entry.date));

  const debitNormal = isDebitNormal(account.type);
  let balance = openingBalance;
  const lines: LedgerLine[] = [];
  const monthSubtotals = new Map<string, { debit: number; credit: number }>();

  for (const { entry, line } of relevant) {
    const monthKey = entry.date.slice(0, 7);
    if (!monthSubtotals.has(monthKey))
      monthSubtotals.set(monthKey, { debit: 0, credit: 0 });
    const subtotal = monthSubtotals.get(monthKey)!;
    const amount = parseAmount(line.amount);
    const isDebit = line.side === "debit";

    balance = isDebit === debitNormal ? balance + amount : balance - amount;
    if (isDebit) subtotal.debit += amount;
    else subtotal.credit += amount;
    lines.push({
      date: entry.date,
      counterAccount: counterAccountsForLine(entry, line),
      memo: entry.description,
      metadata: formatEntryMetadata(resolveEntryLineMetadata(line)),
      debitAmount: isDebit ? amount : 0,
      creditAmount: isDebit ? 0 : amount,
      balance,
    });
  }

  return {
    accountKey: account.key,
    accountName: account.name,
    accountType: account.type,
    openingBalance,
    debitNormal,
    lines,
    monthSubtotals,
  };
}

const HEADER_CELL_STYLE =
  "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;line-height:1.3;";
const BODY_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:4px 4px;vertical-align:top;line-height:1.25;overflow-wrap:anywhere;";
const BAND_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:4px 4px;font-weight:700;vertical-align:top;line-height:1.25;overflow-wrap:anywhere;";

export function buildGeneralLedgerBody(
  entries: EntryRecord[],
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
  heading: PrintHeading,
): string {
  const encounterOrder: AccountIdentity[] = [];
  const seen = new Set<string>();
  const entriesByDate = [...entries].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  for (const entry of entriesByDate) {
    for (const line of entry.lines) {
      const key = entryLineAccountKey(line);
      if (!seen.has(key)) {
        seen.add(key);
        encounterOrder.push({
          key,
          name: line.accountName,
          type: line.accountType,
        });
      }
    }
  }
  const openingSidesByAccountKey = new Map<
    string,
    { debit: number; credit: number }
  >();
  for (const line of openingBalanceLines) {
    if (line.amount === 0) continue;
    const prefix = line.accountId.slice(0, 2);
    const name = line.accountId.slice(2);
    if ((prefix !== "a:" && prefix !== "l:") || name.trim() === "") continue;
    const candidates = encounterOrder.filter(
      (account) => account.name === name && isBalanceSheetAccount(account.type),
    );
    let target = candidates.find((account) =>
      prefix === "a:"
        ? account.type === "asset"
        : account.type === "liability" || account.type === "equity",
    );
    target ??= candidates[0];
    if (target == null) {
      target = {
        key: `opening:${line.accountId}`,
        name,
        type:
          prefix === "a:"
            ? "asset"
            : OPENING_EQUITY_LABELS.has(name)
              ? "equity"
              : "liability",
      };
      encounterOrder.push(target);
    }
    const sides = openingSidesByAccountKey.get(target.key) ?? {
      debit: 0,
      credit: 0,
    };
    if (prefix === "a:") sides.debit += line.amount;
    else sides.credit += line.amount;
    openingSidesByAccountKey.set(target.key, sides);
  }
  const preferredIndex = new Map(
    PREFERRED_LEDGER_ORDER.map((name, index) => [name, index]),
  );
  const accountOrder = [...encounterOrder].sort((left, right) => {
    const leftIndex = preferredIndex.get(left.name);
    const rightIndex = preferredIndex.get(right.name);
    if (leftIndex != null && rightIndex != null) return leftIndex - rightIndex;
    if (leftIndex != null) return -1;
    if (rightIndex != null) return 1;
    return encounterOrder.indexOf(left) - encounterOrder.indexOf(right);
  });

  const ledgers = accountOrder.map((account) => {
    const sides = openingSidesByAccountKey.get(account.key) ?? {
      debit: 0,
      credit: 0,
    };
    const debitBalance = sides.debit - sides.credit;
    const openingBalance = isDebitNormal(account.type)
      ? debitBalance
      : -debitBalance;
    return buildLedger(account, entries, openingBalance);
  });
  const duplicateNameCounts = new Map<string, number>();
  const sameNameAndTypeCounts = new Map<string, number>();
  for (const ledger of ledgers) {
    duplicateNameCounts.set(
      ledger.accountName,
      (duplicateNameCounts.get(ledger.accountName) ?? 0) + 1,
    );
    const nameAndType = `${ledger.accountName}\u0000${ledger.accountType}`;
    sameNameAndTypeCounts.set(
      nameAndType,
      (sameNameAndTypeCounts.get(nameAndType) ?? 0) + 1,
    );
  }
  const ledgerTitles = new Map<(typeof ledgers)[number], string>();
  const seenNameAndType = new Map<string, number>();
  for (const ledger of ledgers) {
    const nameAndType = `${ledger.accountName}\u0000${ledger.accountType}`;
    const position = (seenNameAndType.get(nameAndType) ?? 0) + 1;
    seenNameAndType.set(nameAndType, position);
    const sharesNameWithAnotherType =
      (duplicateNameCounts.get(ledger.accountName) ?? 0) >
      (sameNameAndTypeCounts.get(nameAndType) ?? 0);
    const qualifiers = [
      ...(sharesNameWithAnotherType
        ? [accountTypeLabel(ledger.accountType)]
        : []),
      ...((sameNameAndTypeCounts.get(nameAndType) ?? 0) > 1
        ? [String(position)]
        : []),
    ];
    ledgerTitles.set(
      ledger,
      qualifiers.length === 0
        ? ledger.accountName
        : `${ledger.accountName}（${qualifiers.join("・")}）`,
    );
  }

  if (ledgers.length === 0) {
    return buildPortraitPage(
      "総勘定元帳",
      heading,
      `<div style="text-align:center;padding:48px;color:#475569;font-size:14px;">仕訳データがありません</div>`,
      1,
    );
  }

  let pageNumber = 0;
  return ledgers
    .flatMap((ledger) => {
      const openingOnDebit = ledger.debitNormal
        ? ledger.openingBalance > 0
        : ledger.openingBalance < 0;
      const openingOnCredit = ledger.debitNormal
        ? ledger.openingBalance < 0
        : ledger.openingBalance > 0;
      const openingAmount = Math.abs(ledger.openingBalance);
      const pages = packItemsIntoPages(
        ledgerPageItems(ledger),
        ROW_HEIGHT_BUDGET,
      );
      return pages.map((pageRows) => {
        pageNumber += 1;
        const rowsHtml = pageRows
          .map((row) => {
            if (row.kind === "opening") {
              return `<tr>
  <td style="${BAND_CELL_STYLE};text-align:center">前期繰越</td>
  <td colspan="2" style="${BAND_CELL_STYLE}"></td>
  <td style="${BAND_CELL_STYLE};text-align:right">${openingOnDebit ? formatAmountOrBlank(openingAmount) : ""}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${openingOnCredit ? formatAmountOrBlank(openingAmount) : ""}</td>
  <td style="${BAND_CELL_STYLE};text-align:center">${balanceSide(ledger.openingBalance, ledger.debitNormal)}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatBalance(ledger.openingBalance)}</td>
</tr>
`;
            }
            if (row.kind === "month") {
              return `<tr>
  <td colspan="3" style="${BAND_CELL_STYLE}">${formatMonthLabel(row.monthKey)} 合計</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(row.subtotal.debit)}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(row.subtotal.credit)}</td>
  <td colspan="2" style="${BAND_CELL_STYLE}"></td>
</tr>
`;
            }
            if (row.kind === "total") {
              let grandDebit = openingOnDebit ? openingAmount : 0;
              let grandCredit = openingOnCredit ? openingAmount : 0;
              for (const subtotal of ledger.monthSubtotals.values()) {
                grandDebit += subtotal.debit;
                grandCredit += subtotal.credit;
              }
              return `<tr>
  <td colspan="3" style="${BAND_CELL_STYLE}">合計</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(grandDebit)}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(grandCredit)}</td>
  <td colspan="2" style="${BAND_CELL_STYLE}"></td>
</tr>
`;
            }
            const line = row.line;
            return `<tr>
  <td rowspan="2" style="${BODY_CELL_STYLE};vertical-align:middle;text-align:center">${escapeHtml(formatPrintDate(line.date))}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(line.counterAccount)}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(line.memo)}</td>
  <td colspan="4" style="${BODY_CELL_STYLE}">${escapeHtml(line.metadata)}</td>
</tr>
<tr>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE};text-align:right">${formatAmountOrBlank(line.debitAmount)}</td>
  <td style="${BODY_CELL_STYLE};text-align:right">${formatAmountOrBlank(line.creditAmount)}</td>
  <td style="${BODY_CELL_STYLE};text-align:center">${balanceSide(line.balance, ledger.debitNormal)}</td>
  <td style="${BODY_CELL_STYLE};text-align:right">${formatBalance(line.balance)}</td>
</tr>
`;
          })
          .join("");

        const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
  <colgroup>
    <col style="width:${COLUMN_WIDTHS.date}px"><col style="width:${COLUMN_WIDTHS.counterAccount}px"><col><col style="width:${COLUMN_WIDTHS.debitAmount}px"><col style="width:${COLUMN_WIDTHS.creditAmount}px"><col style="width:${COLUMN_WIDTHS.balanceSide}px"><col style="width:${COLUMN_WIDTHS.balance}px">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" style="${HEADER_CELL_STYLE}">取引日</th>
      <th style="${HEADER_CELL_STYLE}">相手勘定科目</th>
      <th style="${HEADER_CELL_STYLE}">摘要</th>
      <th colspan="4" style="${HEADER_CELL_STYLE}">取引先・区分</th>
    </tr>
    <tr>
      <th style="${HEADER_CELL_STYLE}">相手補助科目</th>
      <th style="${HEADER_CELL_STYLE}">補助科目</th>
      <th style="${HEADER_CELL_STYLE}">借方金額</th>
      <th style="${HEADER_CELL_STYLE}">貸方金額</th>
      <th style="${HEADER_CELL_STYLE}">借/貸</th>
      <th style="${HEADER_CELL_STYLE}">残高</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`;

        const title = ledgerTitles.get(ledger) ?? ledger.accountName;
        return buildPortraitPage(title, heading, tableHtml, pageNumber);
      });
    })
    .join("");
}

type LedgerRow =
  | { kind: "opening" }
  | { kind: "line"; line: LedgerLine }
  | {
      kind: "month";
      monthKey: string;
      subtotal: { debit: number; credit: number };
    }
  | { kind: "total" };

function bandRowHeight(label: string): number {
  return estimateRowHeight(
    [{ text: label, columnWidth: BAND_LABEL_COLUMN_WIDTH }],
    ROW_METRICS,
  );
}

function ledgerLineHeight(line: LedgerLine): number {
  const upper = estimateRowHeight(
    [
      { text: line.counterAccount, columnWidth: COLUMN_WIDTHS.counterAccount },
      { text: line.memo, columnWidth: MEMO_COLUMN_WIDTH },
      { text: line.metadata, columnWidth: METADATA_COLUMN_WIDTH },
    ],
    ROW_METRICS,
  );
  const lower = estimateRowHeight([], ROW_METRICS);
  return upper + lower;
}

function ledgerPageItems(ledger: AccountLedger): PageItem<LedgerRow>[] {
  const items: PageItem<LedgerRow>[] = [];
  if (ledger.openingBalance !== 0) {
    items.push({
      item: { kind: "opening" },
      height: bandRowHeight("前期繰越"),
      keepWithPrevious: false,
    });
  }
  ledger.lines.forEach((line, index) => {
    items.push({
      item: { kind: "line", line },
      height: ledgerLineHeight(line),
      keepWithPrevious: false,
    });
    const monthKey = line.date.slice(0, 7);
    const next = ledger.lines[index + 1];
    const subtotal = ledger.monthSubtotals.get(monthKey);
    if ((next == null || next.date.slice(0, 7) !== monthKey) && subtotal) {
      items.push({
        item: { kind: "month", monthKey, subtotal },
        height: bandRowHeight(`${formatMonthLabel(monthKey)} 合計`),
        keepWithPrevious: true,
      });
    }
  });
  items.push({
    item: { kind: "total" },
    height: bandRowHeight("合計"),
    keepWithPrevious: true,
  });
  return items;
}

function accountTypeLabel(type: BookAccountType): string {
  if (type === "asset") return "資産";
  if (type === "liability") return "負債";
  if (type === "equity") return "純資産";
  if (type === "revenue") return "収益";
  if (type === "cost_of_sales") return "売上原価";
  return "経費";
}

export function buildGeneralLedgerDocument(
  entries: EntryRecord[],
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
  heading: PrintHeading,
): string {
  return buildPrintDocument({
    title: "総勘定元帳",
    orientation: "portrait",
    body: buildGeneralLedgerBody(entries, openingBalanceLines, heading),
  });
}

function counterAccountsForLine(entry: EntryRecord, target: EntryLine): string {
  const oppositeSide = target.side === "debit" ? "credit" : "debit";
  return entry.lines
    .filter((line) => line.side === oppositeSide)
    .map((line) => line.accountName)
    .filter((name) => name.length > 0)
    .join(" / ");
}
