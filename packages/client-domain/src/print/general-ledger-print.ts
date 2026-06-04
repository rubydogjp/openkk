import { getEntryLines, type EntryLine, type EntryRecord } from "../entries/entry-record";
import { parseAmount } from "../shared/parse-utils";
import { buildPrintDocument, escapeHtml as esc } from "./print-shell";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense" | "cost_of_sales";

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

type LedgerLine = {
  date: string;
  counterAccount: string;
  memo: string;
  partner: string;
  debitAmt: number;
  creditAmt: number;
  balance: number;
};

type AccountLedger = {
  accountName: string;
  openingBalance: number;
  lines: LedgerLine[];
  monthSubtotals: Map<string, { debit: number; credit: number }>;
};

function buildLedger(
  accountName: string,
  allEntries: EntryRecord[],
  openingBalance: number,
): AccountLedger {
  const relevant = allEntries
    .flatMap((entry) =>
      getEntryLines(entry)
        .filter((line) => line.accountName === accountName)
        .map((line) => ({ entry, line })),
    )
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date));

  const firstLine = relevant[0]?.line;
  const accountType: AccountType = firstLine
    ? (firstLine.accountType as AccountType)
    : "asset";

  const debitNormal = isDebitNormal(accountType);
  let balance = openingBalance;
  const lines: LedgerLine[] = [];
  const monthSubtotals = new Map<string, { debit: number; credit: number }>();

  for (const { entry: e, line } of relevant) {
    const monthKey = e.date.slice(0, 7);
    if (!monthSubtotals.has(monthKey)) monthSubtotals.set(monthKey, { debit: 0, credit: 0 });
    const sub = monthSubtotals.get(monthKey)!;
    const amt = parseNum(line.amount);

    if (line.side === "debit") {
      balance = debitNormal ? balance + amt : balance - amt;
      sub.debit += amt;
      lines.push({
        date: e.date,
        counterAccount: counterAccountsForLine(e, line),
        memo: e.description,
        partner: e.partner,
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
        partner: e.partner,
        debitAmt: 0,
        creditAmt: amt,
        balance,
      });
    }
  }

  return { accountName, openingBalance, lines, monthSubtotals };
}

const TH = "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;";
const TD = "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:4px 4px;vertical-align:top;line-height:1.25;";
const BAND = "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:4px 4px;font-weight:700;vertical-align:top;line-height:1.25;";

export function buildGeneralLedgerBody(
  _fpName: string,
  entries: EntryRecord[],
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
): string {
  const encounterOrder: string[] = [];
  const seen = new Set<string>();
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const line of getEntryLines(e)) {
      if (!seen.has(line.accountName)) {
        seen.add(line.accountName);
        encounterOrder.push(line.accountName);
      }
    }
  }
  const preferredIndex = new Map(PREFERRED_LEDGER_ORDER.map((n, i) => [n, i]));
  const accountOrder = [...encounterOrder].sort((a, b) => {
    const ia = preferredIndex.get(a);
    const ib = preferredIndex.get(b);
    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;
    return encounterOrder.indexOf(a) - encounterOrder.indexOf(b);
  });

  const ledgers = accountOrder.map((name) => {
    const firstLine = entries
      .flatMap((entry) => getEntryLines(entry))
      .find((line) => line.accountName === name);
    const type: AccountType = firstLine
      ? (firstLine.accountType as AccountType)
      : "asset";
    const prefix = isDebitNormal(type) ? "a:" : "l:";
    const openingLine = openingBalanceLines.find((l) => l.accountId === `${prefix}${name}`);
    return buildLedger(name, entries, openingLine?.amount ?? 0);
  });

  if (ledgers.length === 0) {
    return wrapPage(
      "",
      `<div style="text-align:center;padding:48px;color:#475569;font-size:14px;">仕訳データがありません</div>`,
      1,
    );
  }

  return ledgers
    .map((ledger, pageIdx) => {
      let rowsHtml = "";
      const processedMonths = new Set<string>();

      for (let i = 0; i < ledger.lines.length; i++) {
        const line = ledger.lines[i];
        const monthKey = line.date.slice(0, 7);
        const isLastInMonth =
          i === ledger.lines.length - 1 ||
          ledger.lines[i + 1].date.slice(0, 7) !== monthKey;

        rowsHtml += `<tr>
  <td rowspan="2" style="${TD};vertical-align:middle;text-align:center">${esc(fmtDate(line.date))}</td>
  <td style="${TD}">${esc(line.counterAccount)}</td>
  <td style="${TD}">${esc(line.memo)}</td>
  <td colspan="3" style="${TD}">${esc(line.partner)}</td>
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

      let grandDebit = 0;
      let grandCredit = 0;
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

      const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
  <colgroup>
    <col style="width:75px"><col style="width:120px"><col><col style="width:68px"><col style="width:68px"><col style="width:81px">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" style="${TH}">取引日</th>
      <th style="${TH}">相手勘定科目</th>
      <th style="${TH}">摘要</th>
      <th colspan="3" style="${TH}">取引先</th>
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

      return wrapPage(ledger.accountName, tableHtml, pageIdx + 1);
    })
    .join("");
}

function wrapPage(title: string, bodyHtml: string, pageNumber: number): string {
  return `<div class="bk-page" style="position:relative;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;">
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
