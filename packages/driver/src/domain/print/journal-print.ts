import {
  entryToVisualPairs,
  resolveEntryPairMetadata,
  type EntryLine,
  type EntryRecord,
  type EntryVisualPair,
} from "../entries/entry-record.js";
import { formatAmount, parseAmount } from "../shared/parse-utils.js";
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

const JOURNAL_TITLE = "仕訳帳";

const COLUMN_WIDTHS = {
  date: 77,
  debitAccount: 101,
  debitSubAccount: 77,
  debitAmount: 69,
  creditAccount: 101,
  creditSubAccount: 77,
  creditAmount: 69,
  description: 93,
  metadata: 75,
};
const ROW_METRICS: PrintRowMetrics = { lineHeight: 13, verticalPadding: 10 };
const HEADER_ROW_HEIGHT = 24;
const HEADER_HEIGHT = HEADER_ROW_HEIGHT * 2 + 1;
const ROW_HEIGHT_BUDGET = PORTRAIT_TABLE_HEIGHT_BUDGET - HEADER_HEIGHT;

const HEADER_CELL_STYLE =
  "border:1px solid #1D4ED8;background:#EEF5FF;color:#1D4ED8;font-weight:700;padding:5px 4px;text-align:center;line-height:1.3;";
const BODY_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#FFFFFF;padding:5px 4px;vertical-align:top;line-height:1.3;overflow-wrap:anywhere;";
const BAND_CELL_STYLE =
  "border:1px solid #1D4ED8;color:#111827;background:#EEF5FF;padding:5px 4px;font-weight:700;vertical-align:top;line-height:1.3;overflow-wrap:anywhere;";

export function buildJournalBody(
  entries: EntryRecord[],
  heading: PrintHeading,
): string {
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
      heading,
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

      const pages = packItemsIntoPages(
        journalPageItems(monthEntries, monthLabel),
        ROW_HEIGHT_BUDGET,
      );
      return pages.map((pageRows) => {
        pageNumber += 1;
        const rowsHtml = pageRows
          .map((row) => {
            if (row.kind === "total") {
              return `<tr>
      <td colspan="3" style="${BAND_CELL_STYLE}">${monthLabel} 合計</td>
      <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(debitTotal)}</td>
      <td colspan="2" style="${BAND_CELL_STYLE}"></td>
      <td style="${BAND_CELL_STYLE};text-align:right">${formatAmountOrBlank(creditTotal)}</td>
      <td colspan="2" style="${BAND_CELL_STYLE}"></td>
    </tr>`;
            }
            const cells = journalRowCells(row);
            return `<tr>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(cells.date)}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(cells.debitAccount)}</td>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE};text-align:right">${escapeHtml(cells.debitAmount)}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(cells.creditAccount)}</td>
  <td style="${BODY_CELL_STYLE}"></td>
  <td style="${BODY_CELL_STYLE};text-align:right">${escapeHtml(cells.creditAmount)}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(cells.description)}</td>
  <td style="${BODY_CELL_STYLE}">${escapeHtml(cells.metadata)}</td>
</tr>`;
          })
          .join("\n");

        const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
  <colgroup>
    <col style="width:${COLUMN_WIDTHS.date}px"><col style="width:${COLUMN_WIDTHS.debitAccount}px"><col style="width:${COLUMN_WIDTHS.debitSubAccount}px"><col style="width:${COLUMN_WIDTHS.debitAmount}px">
    <col style="width:${COLUMN_WIDTHS.creditAccount}px"><col style="width:${COLUMN_WIDTHS.creditSubAccount}px"><col style="width:${COLUMN_WIDTHS.creditAmount}px"><col style="width:${COLUMN_WIDTHS.description}px"><col style="width:${COLUMN_WIDTHS.metadata}px">
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
  </tbody>
</table>`;

        return buildPortraitPage(JOURNAL_TITLE, heading, tableHtml, pageNumber);
      });
    })
    .join("");
}

type JournalPairRow = {
  kind: "pair";
  entry: EntryRecord;
  pair: EntryVisualPair;
  pairIndex: number;
};

type JournalRow = JournalPairRow | { kind: "total" };

type JournalRowCells = {
  date: string;
  debitAccount: string;
  debitAmount: string;
  creditAccount: string;
  creditAmount: string;
  description: string;
  metadata: string;
};

function journalRowCells(row: JournalPairRow): JournalRowCells {
  const isFirstPair = row.pairIndex === 0;
  return {
    date: isFirstPair ? formatPrintDate(row.entry.date) : "",
    debitAccount: lineAccountName(row.pair.debit),
    debitAmount: lineAmount(row.pair.debit),
    creditAccount: lineAccountName(row.pair.credit),
    creditAmount: lineAmount(row.pair.credit),
    description: isFirstPair ? row.entry.description : "",
    metadata: formatEntryMetadata(resolveEntryPairMetadata(row.pair)),
  };
}

function journalRowHeight(cells: JournalRowCells): number {
  return estimateRowHeight(
    [
      { text: cells.date, columnWidth: COLUMN_WIDTHS.date },
      { text: cells.debitAccount, columnWidth: COLUMN_WIDTHS.debitAccount },
      { text: cells.debitAmount, columnWidth: COLUMN_WIDTHS.debitAmount },
      { text: cells.creditAccount, columnWidth: COLUMN_WIDTHS.creditAccount },
      { text: cells.creditAmount, columnWidth: COLUMN_WIDTHS.creditAmount },
      { text: cells.description, columnWidth: COLUMN_WIDTHS.description },
      { text: cells.metadata, columnWidth: COLUMN_WIDTHS.metadata },
    ],
    ROW_METRICS,
  );
}

function journalPageItems(
  monthEntries: EntryRecord[],
  monthLabel: string,
): PageItem<JournalRow>[] {
  const items: PageItem<JournalRow>[] = monthEntries.flatMap((entry) =>
    entryToVisualPairs(entry).map((pair, pairIndex) => {
      const row: JournalPairRow = { kind: "pair", entry, pair, pairIndex };
      return {
        item: row,
        height: journalRowHeight(journalRowCells(row)),
        keepWithPrevious: false,
      };
    }),
  );
  items.push({
    item: { kind: "total" },
    height: estimateRowHeight(
      [
        {
          text: `${monthLabel} 合計`,
          columnWidth:
            COLUMN_WIDTHS.date +
            COLUMN_WIDTHS.debitAccount +
            COLUMN_WIDTHS.debitSubAccount,
        },
      ],
      ROW_METRICS,
    ),
    keepWithPrevious: true,
  });
  return items;
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

export function buildJournalDocument(
  entries: EntryRecord[],
  heading: PrintHeading,
): string {
  return buildPrintDocument({
    title: JOURNAL_TITLE,
    orientation: "portrait",
    body: buildJournalBody(entries, heading),
  });
}

function lineAccountName(line: EntryLine | null): string {
  return line?.accountName ?? "";
}

function lineAmount(line: EntryLine | null): string {
  if (line == null || line.amount.trim() === "") return "";
  return formatAmount(parseAmount(line.amount));
}
