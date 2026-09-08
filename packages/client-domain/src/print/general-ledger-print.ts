import {
  entryLineAccountKey,
  getEntryLines,
  resolveEntryLineMetadata,
  type EntryLine,
  type EntryRecord,
} from "../entries/entry-record.js";
import { parseAmount } from "../shared/parse-utils.js";
import { buildPrintDocument, escapeHtml as esc } from "./print-shell.js";
import { formatEntryMetadata } from "./entry-metadata.js";

type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "cost_of_sales";

function parseNum(str: string): number {
  return parseAmount(str);
}

function fmt(n: number): string {
  return n === 0 ? "" : new Intl.NumberFormat("ja-JP").format(n);
}

function fmtBalance(n: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.abs(n));
}

function fmtDate(iso: string): string {
  return iso.replace(/-/g, "/");
}

function fmtMonthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? `${month}月分`
    : "日付未設定";
}

function isDebitNormal(type: AccountType): boolean {
  return type === "asset" || type === "expense" || type === "cost_of_sales";
}

function isBalanceSheetAccount(type: AccountType): boolean {
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

const PAGE_W = 794;
const PAGE_H = 1123;
const SIDE_PAD = 27;
const TOP_PAD = 11;
const BOTTOM_PAD = 19;
const TITLE_FS = 16;
const TITLE_GAP = 19;
const BODY_TOP = TOP_PAD + TITLE_FS + TITLE_GAP;
const MAX_LEDGER_LINES_PER_PAGE = 12;

type LedgerLine = {
  date: string;
  counterAccount: string;
  memo: string;
  metadata: string;
  debitAmt: number;
  creditAmt: number;
  balance: number;
};

type AccountLedger = {
  accountKey: string;
  accountName: string;
  accountType: AccountType;
  openingBalance: number;
  debitNormal: boolean;
  lines: LedgerLine[];
  monthSubtotals: Map<string, { debit: number; credit: number }>;
};

type AccountIdentity = {
  key: string;
  name: string;
  type: AccountType;
};

function buildLedger(
  account: AccountIdentity,
  allEntries: EntryRecord[],
  openingBalance: number,
): AccountLedger {
  const relevant = allEntries
    .flatMap((entry) =>
      getEntryLines(entry)
        .filter((line) => entryLineAccountKey(line) === account.key)
        .map((line) => ({ entry, line })),
    )
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date));

  const debitNormal = isDebitNormal(account.type);
  let balance = openingBalance;
  const lines: LedgerLine[] = [];
  const monthSubtotals = new Map<string, { debit: number; credit: number }>();

  for (const { entry: e, line } of relevant) {
    const monthKey = e.date.slice(0, 7);
    if (!monthSubtotals.has(monthKey))
      monthSubtotals.set(monthKey, { debit: 0, credit: 0 });
    const sub = monthSubtotals.get(monthKey)!;
    const amt = parseNum(line.amount);

    if (line.side === "debit") {
      balance = debitNormal ? balance + amt : balance - amt;
      sub.debit += amt;
      lines.push({
        date: e.date,
        counterAccount: counterAccountsForLine(e, line),
        memo: e.description,
        metadata: formatEntryMetadata(resolveEntryLineMetadata(e, line)),
        debitAmt: amt,
        creditAmt: 0,
        balance,
      });
    } else {
      balance = debitNormal ? balance - amt : balance + amt;
      sub.credit += amt;
      lines.push({
        date: e.date,
        counterAccount: counterAccountsForLine(e, line),
        memo: e.description,
        metadata: formatEntryMetadata(resolveEntryLineMetadata(e, line)),
        debitAmt: 0,
        creditAmt: amt,
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

const TH =
  "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;";
const TD =
  "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:4px 4px;vertical-align:top;line-height:1.25;";
const BAND =
  "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:4px 4px;font-weight:700;vertical-align:top;line-height:1.25;";

export function buildGeneralLedgerBody(
  _fpName: string,
  entries: EntryRecord[],
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
): string {
  const encounterOrder: AccountIdentity[] = [];
  const seen = new Set<string>();
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const line of getEntryLines(e)) {
      const key = entryLineAccountKey(line);
      if (!seen.has(key)) {
        seen.add(key);
        encounterOrder.push({
          key,
          name: line.accountName,
          type: line.accountType as AccountType,
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
            : name === "事業主借" || name === "元入金"
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
  const preferredIndex = new Map(PREFERRED_LEDGER_ORDER.map((n, i) => [n, i]));
  const accountOrder = [...encounterOrder].sort((a, b) => {
    const ia = preferredIndex.get(a.name);
    const ib = preferredIndex.get(b.name);
    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;
    return encounterOrder.indexOf(a) - encounterOrder.indexOf(b);
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
    return wrapPage(
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
  <td style="${BAND};text-align:center">前期繰越</td>
  <td colspan="2" style="${BAND}"></td>
  <td style="${BAND};text-align:right">${openingOnDebit ? fmt(openingAmount) : ""}</td>
  <td style="${BAND};text-align:right">${openingOnCredit ? fmt(openingAmount) : ""}</td>
  <td style="${BAND};text-align:right">${fmtBalance(ledger.openingBalance)}</td>
</tr>
`;
        }

        const globalStart = chunkIndex * MAX_LEDGER_LINES_PER_PAGE;
        for (let i = 0; i < pageLines.length; i++) {
          const line = pageLines[i]!;
          const globalIndex = globalStart + i;
          const monthKey = line.date.slice(0, 7);
          const isLastInMonth =
            globalIndex === ledger.lines.length - 1 ||
            ledger.lines[globalIndex + 1]!.date.slice(0, 7) !== monthKey;

          rowsHtml += `<tr>
  <td rowspan="2" style="${TD};vertical-align:middle;text-align:center">${esc(fmtDate(line.date))}</td>
  <td style="${TD}">${esc(line.counterAccount)}</td>
  <td style="${TD}">${esc(line.memo)}</td>
  <td colspan="3" style="${TD}">${esc(line.metadata)}</td>
</tr>
<tr>
  <td style="${TD}"></td>
  <td style="${TD}"></td>
  <td style="${TD};text-align:right">${fmt(line.debitAmt)}</td>
  <td style="${TD};text-align:right">${fmt(line.creditAmt)}</td>
  <td style="${TD};text-align:right">${fmtBalance(line.balance)}</td>
</tr>
`;

          if (isLastInMonth && !processedMonths.has(monthKey)) {
            processedMonths.add(monthKey);
            const sub = ledger.monthSubtotals.get(monthKey);
            if (sub) {
              rowsHtml += `<tr>
  <td colspan="3" style="${BAND}">${fmtMonthLabel(monthKey)} 合計</td>
  <td style="${BAND};text-align:right">${fmt(sub.debit)}</td>
  <td style="${BAND};text-align:right">${fmt(sub.credit)}</td>
  <td style="${BAND}"></td>
</tr>
`;
            }
          }
        }

        if (chunkIndex === chunks.length - 1) {
          let grandDebit = openingOnDebit ? openingAmount : 0;
          let grandCredit = openingOnCredit ? openingAmount : 0;
          for (const sub of ledger.monthSubtotals.values()) {
            grandDebit += sub.debit;
            grandCredit += sub.credit;
          }
          rowsHtml += `<tr>
  <td colspan="3" style="${BAND}">合計</td>
  <td style="${BAND};text-align:right">${fmt(grandDebit)}</td>
  <td style="${BAND};text-align:right">${fmt(grandCredit)}</td>
  <td style="${BAND}"></td>
</tr>
`;
        }

        const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
  <colgroup>
    <col style="width:75px"><col style="width:120px"><col><col style="width:68px"><col style="width:68px"><col style="width:81px">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" style="${TH}">取引日</th>
      <th style="${TH}">相手勘定科目</th>
      <th style="${TH}">摘要</th>
      <th colspan="3" style="${TH}">取引先・区分</th>
    </tr>
    <tr>
      <th style="${TH}">相手補助科目</th>
      <th style="${TH}">補助科目</th>
      <th style="${TH}">借方金額</th>
      <th style="${TH}">貸方金額</th>
      <th style="${TH}">残高</th>
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
        return wrapPage(title, tableHtml, pageNumber);
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

function accountTypeLabel(type: AccountType): string {
  if (type === "asset") return "資産";
  if (type === "liability") return "負債";
  if (type === "equity") return "純資産";
  if (type === "revenue") return "収益";
  if (type === "cost_of_sales") return "売上原価";
  return "経費";
}

function wrapPage(title: string, bodyHtml: string, pageNumber: number): string {
  return `<div class="bk-page" style="position:relative;width:${PAGE_W}px;min-height:${PAGE_H}px;height:auto;overflow:visible;padding-bottom:${BOTTOM_PAD + 24}px;">
<div style="position:absolute;top:${TOP_PAD}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;text-align:center;color:#1D4ED8;font-weight:700;font-size:${TITLE_FS}px;line-height:1;">${esc(title)}</div>
<div style="position:absolute;top:${BODY_TOP}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;">
${bodyHtml}
</div>
<div style="position:absolute;bottom:${BOTTOM_PAD}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;text-align:center;color:#1D4ED8;font-size:12px;line-height:1;">− ${pageNumber} −</div>
</div>`;
}

export function buildGeneralLedgerDocument(
  fpName: string,
  entries: EntryRecord[],
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
): string {
  return buildPrintDocument({
    title: "総勘定元帳",
    orientation: "portrait",
    body: buildGeneralLedgerBody(fpName, entries, openingBalanceLines),
  });
}

function counterAccountsForLine(entry: EntryRecord, target: EntryLine): string {
  const oppositeSide = target.side === "debit" ? "credit" : "debit";
  return getEntryLines(entry)
    .filter((line) => line.side === oppositeSide)
    .map((line) => line.accountName)
    .filter((name) => name.length > 0)
    .join(" / ");
}
