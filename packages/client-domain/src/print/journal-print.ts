import type { EntryRecord } from "../entries/entry-record";
import { buildPrintDocument, escapeHtml as esc } from "./print-shell";

function parseNum(str: string): number {
  return Number(str.replace(/,/g, "")) || 0;
}

function fmt(n: number): string {
  return n === 0 ? "" : new Intl.NumberFormat("ja-JP").format(n);
}

function fmtDate(iso: string): string {

  return iso.replace(/-/g, "/");
}

const PAGE_W = 794;
const PAGE_H = 1123;
const SIDE_PAD = 27;
const TOP_PAD = 11;
const BOTTOM_PAD = 19;
const TITLE_FS = 16;
const TITLE_GAP = 19;
const BODY_TOP = TOP_PAD + TITLE_FS + TITLE_GAP;

const TH = "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;";
const TD = "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:5px 4px;vertical-align:top;line-height:1.3;";
const BAND = "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:5px 4px;font-weight:700;vertical-align:top;line-height:1.3;";

export function buildJournalBody(_fpName: string, entries: EntryRecord[]): string {
  const map = new Map<string, EntryRecord[]>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  for (const rows of map.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
  }
  const monthGroups = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (monthGroups.length === 0) {
    return wrapPage(
      `<div style="text-align:center;padding:48px;color:#475569;font-size:14px;">仕訳データがありません</div>`,
      1,
    );
  }

  return monthGroups
    .map(([monthKey, rows], pageIdx) => {
      const month = Number(monthKey.slice(5, 7));
      const monthLabel = `${month}月分`;
      const debitTotal = rows.reduce((s, r) => s + parseNum(r.debitAmount), 0);
      const creditTotal = rows.reduce((s, r) => s + parseNum(r.creditAmount), 0);

      const rowsHtml = rows
        .map(
          (row) => `<tr>
  <td style="${TD}">${fmtDate(row.date)}</td>
  <td style="${TD}">${esc(row.debit)}</td>
  <td style="${TD}"></td>
  <td style="${TD};text-align:right">${esc(row.debitAmount)}</td>
  <td style="${TD}">${esc(row.credit)}</td>
  <td style="${TD}"></td>
  <td style="${TD};text-align:right">${esc(row.creditAmount)}</td>
  <td style="${TD}">${esc(row.description)}</td>
  <td style="${TD}">${esc(row.partner)}</td>
</tr>`,
        )
        .join("\n");

      const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
  <colgroup>
    <col style="width:77px"><col style="width:101px"><col style="width:77px"><col style="width:69px">
    <col style="width:101px"><col style="width:77px"><col style="width:69px"><col style="width:93px"><col style="width:75px">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" style="${TH}">取引日</th>
      <th colspan="3" style="${TH}">借方</th>
      <th colspan="3" style="${TH}">貸方</th>
      <th rowspan="2" style="${TH}">摘要</th>
      <th rowspan="2" style="${TH}">取引先</th>
    </tr>
    <tr>
      <th style="${TH}">勘定科目</th><th style="${TH}">補助科目</th><th style="${TH}">金額</th>
      <th style="${TH}">勘定科目</th><th style="${TH}">補助科目</th><th style="${TH}">金額</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
    <tr>
      <td colspan="3" style="${BAND}">${monthLabel} 合計</td>
      <td style="${BAND};text-align:right">${fmt(debitTotal)}</td>
      <td colspan="2" style="${BAND}"></td>
      <td style="${BAND};text-align:right">${fmt(creditTotal)}</td>
      <td colspan="2" style="${BAND}"></td>
    </tr>
  </tbody>
</table>`;

      return wrapPage(tableHtml, pageIdx + 1);
    })
    .join("");
}

function wrapPage(bodyHtml: string, pageNumber: number): string {
  return `<div class="bk-page" style="position:relative;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;">
<div style="position:absolute;top:${TOP_PAD}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;text-align:center;color:#1D4ED8;font-weight:700;font-size:${TITLE_FS}px;line-height:1;">仕訳帳</div>
<div style="position:absolute;top:${BODY_TOP}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;">
${bodyHtml}
</div>
<div style="position:absolute;bottom:${BOTTOM_PAD}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;text-align:center;color:#1D4ED8;font-size:12px;line-height:1;">− ${pageNumber} −</div>
</div>`;
}

export function buildJournalDocument(fpName: string, entries: EntryRecord[]): string {
  return buildPrintDocument({
    title: "仕訳帳",
    orientation: "portrait",
    body: buildJournalBody(fpName, entries),
  });
}
