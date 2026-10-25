import {
  entryLineAccountKey,
  resolveEntryLineMetadata,
  type EntryLine,
  type EntryRecord,
} from "../entries/entry-record.js";
import type { BookAccountType } from "../entries/book-account.js";
import { formatAmount, parseAmount } from "../shared/parse-utils.js";
import { OPENING_EQUITY_LABELS } from "../steps/summary.js";
import { buildPrintDocument, escapeHtml } from "./print-shell.js";
import { buildPortraitPage } from "./portrait-page.js";
import {
  formatAmountOrBlank,
  formatMonthLabel,
  formatPrintDate,
} from "./print-format.js";
import { formatEntryMetadata } from "./entry-metadata.js";

function formatBalance(balance: number): string {
  return formatAmount(Math.abs(balance));
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
  "研修費",
  "会議費",
  "工具器具備品",
  "事業主貸",
  "事業主借",
  "元入金",
];

const MAX_LEDGER_LINES_PER_PAGE = 12;

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

    if (line.side === "debit") {
      balance = debitNormal ? balance + amount : balance - amount;
      subtotal.debit += amount;
      lines.push({
        date: entry.date,
        counterAccount: counterAccountsForLine(entry, line),
        memo: entry.description,
        metadata: formatEntryMetadata(resolveEntryLineMetadata(line)),
        debitAmount: amount,
        creditAmount: 0,
        balance,
      });
    } else {
      balance = debitNormal ? balance - amount : balance + amount;
      subtotal.credit += amount;
      lines.push({
        date: entry.date,
        counterAccount: counterAccountsForLine(entry, line),
        memo: entry.description,
        metadata: formatEntryMetadata(resolveEntryLineMetadata(line)),
        debitAmount: 0,
        creditAmount: amount,
        balance,
      });
    }
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
  "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;";
const BODY_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:4px 4px;vertical-align:top;line-height:1.25;";
const BAND_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:4px 4px;font-weight:700;vertical-align:top;line-height:1.25;";

export function buildGeneralLedgerBody(
  entries: EntryRecord[],
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
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
      (account) =>
        account.name === name && isBalanceSheetAccount(account.type),
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
  for (const ledger of ledgers) {
    duplicateNameCounts.set(
      ledger.accountName,
      (duplicateNameCounts.get(ledger.accountName) ?? 0) + 1,
    );
  }

  if (ledgers.length === 0) {
    return buildPortraitPage(
      "",
      `<div style="text-align:center;padding:48px;color:#475569;font-size:14px;">仕訳データがありません</div>`,
      1,
    );
  }

  let pageNumber = 0;
  return ledgers
    .flatMap((ledger) => {
      const chunks = chunkLedgerLines(ledger.lines);
      return chunks.map((pageLines, chunkIndex) => {
        pageNumber += 1;
        let rowsHtml = "";
        const processedMonths = new Set<string>();
        const openingOnDebit = ledger.debitNormal
          ? ledger.openingBalance > 0
          : ledger.openingBalance < 0;
        const openingOnCredit = ledger.debitNormal
          ? ledger.openingBalance < 0
          : ledger.openingBalance > 0;
        const openingAmount = Math.abs(ledger.openingBalance);

        if (chunkIndex === 0 && ledger.openingBalance !== 0) {
          rowsHtml += `<tr>
  <td style="${BAND_CELL_STYLE};text-align:center">前期繰越</td>
  <td colspan="2" style="${BAND_CELL_STYLE}"></td>
  <td style="${BAND_CELL_STYLE};text-align:right">${openingOnDebit ? formatAmountOrBlank(openingAmount) : ""}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${openingOnCredit ? formatAmountOrBlank(openingAmount) : ""}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatBalance(ledger.openingBalance)}</td>
</tr>
`;
        }

        const globalStart = chunkIndex * MAX_LEDGER_LINES_PER_PAGE;
        for (let pageIndex = 0; pageIndex < pageLines.length; pageIndex++) {
          const line = pageLines[pageIndex]!;
          const globalIndex = globalStart + pageIndex;
          const monthKey = line.date.slice(0, 7);
          const isLastInMonth =
            globalIndex === ledger.lines.length - 1 ||
            ledger.lines[globalIndex + 1]!.date.slice(0, 7) !== monthKey;

          rowsHtml += `<tr>
  <td rowspan="2" style="${BODY_CELL_STYLE};vertical-align:middle;text-align:center">${escapeHtml(formatPrintDate(line.date))}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(line.counterAccount)}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(line.memo)}</td>
  <td colspan="3" style="${BODY_CELL_STYLE}">${escapeHtml(line.metadata)}</td>
</tr>
<tr>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE};text-align:right">${formatAmountOrBlank(line.debitAmount)}</td>
  <td style="${BODY_CELL_STYLE};text-align:right">${formatAmountOrBlank(line.creditAmount)}</td>
  <td style="${BODY_CELL_STYLE};text-align:right">${formatBalance(line.balance)}</td>
</tr>
`;

          if (isLastInMonth && !processedMonths.has(monthKey)) {
            processedMonths.add(monthKey);
            const subtotal = ledger.monthSubtotals.get(monthKey);
            if (subtotal) {
              rowsHtml += `<tr>
  <td colspan="3" style="${BAND_CELL_STYLE}">${formatMonthLabel(monthKey)} 合計</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(subtotal.debit)}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(subtotal.credit)}</td>
  <td style="${BAND_CELL_STYLE}"></td>
</tr>
`;
            }
          }
        }

        if (chunkIndex === chunks.length - 1) {
          let grandDebit = openingOnDebit ? openingAmount : 0;
          let grandCredit = openingOnCredit ? openingAmount : 0;
          for (const subtotal of ledger.monthSubtotals.values()) {
            grandDebit += subtotal.debit;
            grandCredit += subtotal.credit;
          }
          rowsHtml += `<tr>
  <td colspan="3" style="${BAND_CELL_STYLE}">合計</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(grandDebit)}</td>
  <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(grandCredit)}</td>
  <td style="${BAND_CELL_STYLE}"></td>
</tr>
`;
        }

        const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
  <colgroup>
    <col style="width:75px"><col style="width:120px"><col><col style="width:68px"><col style="width:68px"><col style="width:81px">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" style="${HEADER_CELL_STYLE}">取引日</th>
      <th style="${HEADER_CELL_STYLE}">相手勘定科目</th>
      <th style="${HEADER_CELL_STYLE}">摘要</th>
      <th colspan="3" style="${HEADER_CELL_STYLE}">取引先・区分</th>
    </tr>
    <tr>
      <th style="${HEADER_CELL_STYLE}">相手補助科目</th>
      <th style="${HEADER_CELL_STYLE}">補助科目</th>
      <th style="${HEADER_CELL_STYLE}">借方金額</th>
      <th style="${HEADER_CELL_STYLE}">貸方金額</th>
      <th style="${HEADER_CELL_STYLE}">残高</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`;

        const title =
          (duplicateNameCounts.get(ledger.accountName) ?? 0) > 1
            ? `${ledger.accountName}（${accountTypeLabel(ledger.accountType)}）`
            : ledger.accountName;
        return buildPortraitPage(title, tableHtml, pageNumber);
      });
    })
    .join("");
}

function chunkLedgerLines(lines: LedgerLine[]): LedgerLine[][] {
  const chunks: LedgerLine[][] = [];
  for (
    let index = 0;
    index < lines.length;
    index += MAX_LEDGER_LINES_PER_PAGE
  ) {
    chunks.push(lines.slice(index, index + MAX_LEDGER_LINES_PER_PAGE));
  }
  return chunks.length === 0 ? [[]] : chunks;
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
): string {
  return buildPrintDocument({
    title: "総勘定元帳",
    orientation: "portrait",
    body: buildGeneralLedgerBody(entries, openingBalanceLines),
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
