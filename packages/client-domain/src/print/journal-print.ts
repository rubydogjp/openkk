import {
  entryToVisualPairs,
  getEntryLines,
  resolveEntryPairMetadata,
  type EntryLine,
  type EntryRecord,
} from "../entries/entry-record.js";
import { parseAmount } from "../shared/parse-utils.js";
import { buildPrintDocument, escapeHtml as esc } from "./print-shell.js";
import { formatEntryMetadata } from "./entry-metadata.js";

function parseNum(str: string): number {
  return parseAmount(str);
}

function fmt(n: number): string {
  return n === 0 ? "" : new Intl.NumberFormat("ja-JP").format(n);
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

const PAGE_W = 794;
const PAGE_H = 1123;
const SIDE_PAD = 27;
const TOP_PAD = 11;
const BOTTOM_PAD = 19;
const TITLE_FS = 16;
const TITLE_GAP = 19;
const BODY_TOP = TOP_PAD + TITLE_FS + TITLE_GAP;
const MAX_DETAIL_ROWS_PER_PAGE = 28;

const TH =
  "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;";
const TD =
  "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:5px 4px;vertical-align:top;line-height:1.3;";
const BAND =
  "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:5px 4px;font-weight:700;vertical-align:top;line-height:1.3;";

export function buildJournalBody(
  _fpName: string,
  entries: EntryRecord[],
): string {
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

  let pageNumber = 0;
  return monthGroups
    .flatMap(([monthKey, rows]) => {
      const monthLabel = fmtMonthLabel(monthKey);
      const debitTotal = rows.reduce(
        (s, r) =>
          s +
          getEntryLines(r)
            .filter((line) => line.side === "debit")
            .reduce((lineSum, line) => lineSum + parseNum(line.amount), 0),
        0,
      );
      const creditTotal = rows.reduce(
        (s, r) =>
          s +
          getEntryLines(r)
            .filter((line) => line.side === "credit")
            .reduce((lineSum, line) => lineSum + parseNum(line.amount), 0),
        0,
      );

      const chunks = chunkEntriesByVisualRows(rows);
      return chunks.map((pageRows, chunkIndex) => {
        pageNumber += 1;
        const rowsHtml = pageRows
          .flatMap(({ entry, pairs, pairOffset }) =>
            pairs.map((pair, index) => {
              const isFirstPair = pairOffset + index === 0;
              const metadata = formatEntryMetadata(
                resolveEntryPairMetadata(entry, pair),
              );
              return `<tr>
  <td style="${TD}">${isFirstPair ? esc(fmtDate(entry.date)) : ""}</td>
  <td style="${TD}">${esc(lineAccountName(pair.debit))}</td>
  <td style="${TD}"></td>
  <td style="${TD};text-align:right">${esc(lineAmount(pair.debit))}</td>
  <td style="${TD}">${esc(lineAccountName(pair.credit))}</td>
  <td style="${TD}"></td>
  <td style="${TD};text-align:right">${esc(lineAmount(pair.credit))}</td>
  <td style="${TD}">${isFirstPair ? esc(entry.description) : ""}</td>
  <td style="${TD}">${esc(metadata)}</td>
</tr>`;
            }),
          )
          .join("\n");

        const isLastChunk = chunkIndex === chunks.length - 1;
        const totalHtml = isLastChunk
          ? `<tr>
      <td colspan="3" style="${BAND}">${monthLabel} 合計</td>
      <td style="${BAND};text-align:right">${fmt(debitTotal)}</td>
      <td colspan="2" style="${BAND}"></td>
      <td style="${BAND};text-align:right">${fmt(creditTotal)}</td>
      <td colspan="2" style="${BAND}"></td>
    </tr>`
          : "";
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
      <th rowspan="2" style="${TH}">取引先・区分</th>
    </tr>
    <tr>
      <th style="${TH}">勘定科目</th><th style="${TH}">補助科目</th><th style="${TH}">金額</th>
      <th style="${TH}">勘定科目</th><th style="${TH}">補助科目</th><th style="${TH}">金額</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
    ${totalHtml}
  </tbody>
</table>`;

        return wrapPage(tableHtml, pageNumber);
      });
    })
    .join("");
}

type JournalPageEntry = {
  entry: EntryRecord;
  pairs: ReturnType<typeof entryToVisualPairs>;
  pairOffset: number;
};

function chunkEntriesByVisualRows(entries: EntryRecord[]): JournalPageEntry[][] {
  const chunks: JournalPageEntry[][] = [];
  let current: JournalPageEntry[] = [];
  let currentRows = 0;
  for (const entry of entries) {
    const pairs = entryToVisualPairs(entry);
    for (let offset = 0; offset < pairs.length; ) {
      if (currentRows === MAX_DETAIL_ROWS_PER_PAGE) {
        chunks.push(current);
        current = [];
        currentRows = 0;
      }
      const take = Math.min(
        MAX_DETAIL_ROWS_PER_PAGE - currentRows,
        pairs.length - offset,
      );
      current.push({
        entry,
        pairs: pairs.slice(offset, offset + take),
        pairOffset: offset,
      });
      currentRows += take;
      offset += take;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function wrapPage(bodyHtml: string, pageNumber: number): string {
  return `<div class="bk-page" style="position:relative;width:${PAGE_W}px;min-height:${PAGE_H}px;height:auto;overflow:visible;padding-bottom:${BOTTOM_PAD + 24}px;">
<div style="position:absolute;top:${TOP_PAD}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;text-align:center;color:#1D4ED8;font-weight:700;font-size:${TITLE_FS}px;line-height:1;">仕訳帳</div>
<div style="position:absolute;top:${BODY_TOP}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;">
${bodyHtml}
</div>
<div style="position:absolute;bottom:${BOTTOM_PAD}px;left:${SIDE_PAD}px;right:${SIDE_PAD}px;text-align:center;color:#1D4ED8;font-size:12px;line-height:1;">− ${pageNumber} −</div>
</div>`;
}

export function buildJournalDocument(
  fpName: string,
  entries: EntryRecord[],
): string {
  return buildPrintDocument({
    title: "仕訳帳",
    orientation: "portrait",
    body: buildJournalBody(fpName, entries),
  });
}

function lineAccountName(line: EntryLine | null): string {
  return line?.accountName ?? "";
}

function lineAmount(line: EntryLine | null): string {
  if (line == null || line.amount.trim() === "") return "";
  return new Intl.NumberFormat("ja-JP").format(parseAmount(line.amount));
}
