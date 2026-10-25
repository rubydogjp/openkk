import {
  entryToVisualPairs,
  resolveEntryPairMetadata,
  type EntryLine,
  type EntryRecord,
} from "../entries/entry-record.js";
import { formatAmount, parseAmount } from "../shared/parse-utils.js";
import { buildPrintDocument, escapeHtml } from "./print-shell.js";
import { buildPortraitPage } from "./portrait-page.js";
import {
  formatAmountOrBlank,
  formatMonthLabel,
  formatPrintDate,
} from "./print-format.js";
import { formatEntryMetadata } from "./entry-metadata.js";

const JOURNAL_TITLE = "仕訳帳";
const MAX_DETAIL_ROWS_PER_PAGE = 28;

const HEADER_CELL_STYLE =
  "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;";
const BODY_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:5px 4px;vertical-align:top;line-height:1.3;";
const BAND_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:5px 4px;font-weight:700;vertical-align:top;line-height:1.3;";

export function buildJournalBody(entries: EntryRecord[]): string {
  const entriesByMonth = new Map<string, EntryRecord[]>();
  for (const entry of entries) {
    const monthKey = entry.date.slice(0, 7);
    if (!entriesByMonth.has(monthKey)) entriesByMonth.set(monthKey, []);
    entriesByMonth.get(monthKey)!.push(entry);
  }
  for (const monthEntries of entriesByMonth.values()) {
    monthEntries.sort((left, right) => left.date.localeCompare(right.date));
  }
  const monthGroups = [...entriesByMonth.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (monthGroups.length === 0) {
    return buildPortraitPage(
      JOURNAL_TITLE,
      `<div style="text-align:center;padding:48px;color:#475569;font-size:14px;">仕訳データがありません</div>`,
      1,
    );
  }

  let pageNumber = 0;
  return monthGroups
    .flatMap(([monthKey, monthEntries]) => {
      const monthLabel = formatMonthLabel(monthKey);
      const debitTotal = sideTotal(monthEntries, "debit");
      const creditTotal = sideTotal(monthEntries, "credit");

      const chunks = chunkEntriesByVisualRows(monthEntries);
      return chunks.map((pageRows, chunkIndex) => {
        pageNumber += 1;
        const rowsHtml = pageRows
          .flatMap(({ entry, pairs, pairOffset }) =>
            pairs.map((pair, index) => {
              const isFirstPair = pairOffset + index === 0;
              const metadata = formatEntryMetadata(
                resolveEntryPairMetadata(pair),
              );
              return `<tr>
  <td style="${BODY_CELL_STYLE}">${isFirstPair ? escapeHtml(formatPrintDate(entry.date)) : ""}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(lineAccountName(pair.debit))}</td>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE};text-align:right">${escapeHtml(lineAmount(pair.debit))}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(lineAccountName(pair.credit))}</td>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE};text-align:right">${escapeHtml(lineAmount(pair.credit))}</td>
  <td style="${BODY_CELL_STYLE}">${isFirstPair ? escapeHtml(entry.description) : ""}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(metadata)}</td>
</tr>`;
            }),
          )
          .join("\n");

        const isLastChunk = chunkIndex === chunks.length - 1;
        const totalHtml = isLastChunk
          ? `<tr>
      <td colspan="3" style="${BAND_CELL_STYLE}">${monthLabel} 合計</td>
      <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(debitTotal)}</td>
      <td colspan="2" style="${BAND_CELL_STYLE}"></td>
      <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(creditTotal)}</td>
      <td colspan="2" style="${BAND_CELL_STYLE}"></td>
    </tr>`
          : "";
        const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
  <colgroup>
    <col style="width:77px"><col style="width:101px"><col style="width:77px"><col style="width:69px">
    <col style="width:101px"><col style="width:77px"><col style="width:69px"><col style="width:93px"><col style="width:75px">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" style="${HEADER_CELL_STYLE}">取引日</th>
      <th colspan="3" style="${HEADER_CELL_STYLE}">借方</th>
      <th colspan="3" style="${HEADER_CELL_STYLE}">貸方</th>
      <th rowspan="2" style="${HEADER_CELL_STYLE}">摘要</th>
      <th rowspan="2" style="${HEADER_CELL_STYLE}">取引先・区分</th>
    </tr>
    <tr>
      <th style="${HEADER_CELL_STYLE}">勘定科目</th><th style="${HEADER_CELL_STYLE}">補助科目</th><th style="${HEADER_CELL_STYLE}">金額</th>
      <th style="${HEADER_CELL_STYLE}">勘定科目</th><th style="${HEADER_CELL_STYLE}">補助科目</th><th style="${HEADER_CELL_STYLE}">金額</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
    ${totalHtml}
  </tbody>
</table>`;

        return buildPortraitPage(JOURNAL_TITLE, tableHtml, pageNumber);
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

function sideTotal(entries: EntryRecord[], side: EntryLine["side"]): number {
  return entries.reduce(
    (sum, entry) =>
      sum +
      entry.lines
        .filter((line) => line.side === side)
        .reduce((lineSum, line) => lineSum + parseAmount(line.amount), 0),
    0,
  );
}

export function buildJournalDocument(entries: EntryRecord[]): string {
  return buildPrintDocument({
    title: JOURNAL_TITLE,
    orientation: "portrait",
    body: buildJournalBody(entries),
  });
}

function lineAccountName(line: EntryLine | null): string {
  return line?.accountName ?? "";
}

function lineAmount(line: EntryLine | null): string {
  if (line == null || line.amount.trim() === "") return "";
  return formatAmount(parseAmount(line.amount));
}
