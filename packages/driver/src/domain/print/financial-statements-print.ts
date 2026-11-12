import { formatAmount } from "../shared/parse-utils.js";
import type { FsBsRow, FsExpenseWriteIn } from "./fs-data.js";
import { buildPrintDocument, escapeHtml } from "./print-shell.js";

function writeInLabelOverrides(
  writeIns: ReadonlyArray<FsExpenseWriteIn>,
): Record<number, string> {
  return Object.fromEntries(
    writeIns.map((writeIn) => [writeIn.row, writeIn.label]),
  );
}

function formatOptionalAmount(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "";
  return formatAmount(amount);
}

const BLUE = "#1D4ED8";
const BLUE_LIGHT = "#EEF5FF";
const TEXT_DARK = "#334155";

const NO_W = 32;
const LABEL_W = 149;
const AMOUNT_W = 149;
const HEADER_H = 27;
const GROUP_GAP = 8;
const COL_GAP = 16;
const BS_LABEL_W = 184;
const BS_AMOUNT_W = 85;
const BS_ROW_H = 25;
const BS_HEADER_H = 29;

type PLRow = {
  label: string;
  note: string | null;
  index: number;
  height: number;
};
type PLGroup = { title: string; rows: PLRow[] };

const LEFT_GROUPS: PLGroup[] = [
  {
    title: "売上",
    rows: [{ label: "売上金額", note: "(雑収入を含む)", index: 1, height: 29 }],
  },
  {
    title: "売上原価",
    rows: [
      { label: "期首商品棚卸高", index: 2, height: 32, note: null },
      { label: "仕入金額", index: 3, height: 29, note: null },
      { label: "小計", note: "(2+3)", index: 4, height: 29 },
      { label: "期末商品棚卸高", index: 5, height: 32, note: null },
      { label: "差引原価", note: "(4-5)", index: 6, height: 29 },
    ],
  },
  {
    title: "差し引き金額",
    rows: [{ label: "差引金額", note: "(1-6)", index: 7, height: 29 }],
  },
  {
    title: "経費",
    rows: [
      { label: "租税公課", index: 8, height: 24, note: null },
      { label: "荷造運賃", index: 9, height: 24, note: null },
      { label: "水道光熱費", index: 10, height: 24, note: null },
      { label: "旅費交通費", index: 11, height: 24, note: null },
      { label: "通信費", index: 12, height: 24, note: null },
      { label: "広告宣伝費", index: 13, height: 24, note: null },
      { label: "接待交際費", index: 14, height: 24, note: null },
      { label: "損害保険料", index: 15, height: 24, note: null },
      { label: "修繕費", index: 16, height: 24, note: null },
    ],
  },
];

const CENTER_GROUPS: PLGroup[] = [
  {
    title: "経費",
    rows: [
      { label: "消耗品費", index: 17, height: 24, note: null },
      { label: "減価償却費", index: 18, height: 24, note: null },
      { label: "福利厚生費", index: 19, height: 24, note: null },
      { label: "給料賃金", index: 20, height: 24, note: null },
      { label: "外注工賃", index: 21, height: 24, note: null },
      { label: "利子割引料", index: 22, height: 24, note: null },
      { label: "地代家賃", index: 23, height: 24, note: null },
      { label: "貸倒金", index: 24, height: 24, note: null },
      { label: "会議費", index: 25, height: 24, note: null },
      { label: "", index: 26, height: 24, note: null },
      { label: "", index: 27, height: 24, note: null },
      { label: "", index: 28, height: 24, note: null },
      { label: "", index: 29, height: 24, note: null },
      { label: "", index: 30, height: 24, note: null },
      { label: "雑費", index: 31, height: 24, note: null },
      { label: "計", index: 32, height: 24, note: null },
    ],
  },
  {
    title: "差引金額",
    rows: [{ label: "差引金額", note: "(7-32)", index: 33, height: 29 }],
  },
];

const RIGHT_GROUPS: PLGroup[] = [
  {
    title: "繰戻額等",
    rows: [
      { label: "貸倒引当金", index: 34, height: 27, note: null },
      { label: "", index: 35, height: 27, note: null },
      { label: "", index: 36, height: 27, note: null },
      { label: "計", index: 37, height: 27, note: null },
    ],
  },
  {
    title: "繰入額等",
    rows: [
      { label: "専従者給与", index: 38, height: 27, note: null },
      { label: "貸倒引当金", index: 39, height: 27, note: null },
      { label: "", index: 40, height: 27, note: null },
      { label: "", index: 41, height: 27, note: null },
      { label: "計", index: 42, height: 24, note: null },
    ],
  },
  {
    title: "所得金額",
    rows: [
      { label: "控除前の所得金額", note: "(33+37-42)", index: 43, height: 29 },
    ],
  },
];

function buildGroupHtml(
  group: PLGroup,
  amounts: Record<number, number | null>,
  labelOverrides: Record<number, string>,
): string {
  const headerStyle = [
    `height:${HEADER_H}px`,
    `display:flex`,
    `background:${BLUE_LIGHT}`,
    `border-bottom:0.8px solid ${BLUE}`,
  ].join(";");

  const cellBase = `display:flex;align-items:center;justify-content:center;`;
  const noCell = `${cellBase}width:${NO_W}px;flex-shrink:0;border-right:0.8px solid ${BLUE};`;
  const labelCell = `${cellBase}width:${LABEL_W}px;flex-shrink:0;border-right:0.8px solid ${BLUE};`;
  const amountCell = `${cellBase}width:${AMOUNT_W}px;flex-shrink:0;`;

  const rowsHtml = group.rows
    .map((row) => {
      const rowStyle = `display:flex;height:${row.height}px;border-bottom:0.8px solid ${BLUE};`;
      const labelInner = `display:flex;flex-direction:column;justify-content:center;padding:2px 5px;overflow:hidden;width:${LABEL_W}px;flex-shrink:0;border-right:0.8px solid ${BLUE};`;
      const label = labelOverrides[row.index] ?? row.label;
      return `<div style="${rowStyle}">
  <div style="${noCell}"><span style="font-size:9px;color:${BLUE}">${row.index}</span></div>
  <div style="${labelInner}">
    <span style="font-size:8px;color:${BLUE};line-height:1.1">${escapeHtml(label)}</span>
    ${row.note ? `<span style="font-size:6px;color:${BLUE};line-height:1.1">${escapeHtml(row.note)}</span>` : ""}
  </div>
  <div style="${amountCell}justify-content:flex-end;padding:2px 8px;"><span style="font-size:10px;color:${TEXT_DARK}">${formatOptionalAmount(amounts[row.index] ?? null)}</span></div>
</div>`;
    })
    .join("\n");

  return `<div style="border:1px solid ${BLUE};margin-bottom:${GROUP_GAP}px">
<div style="${headerStyle}">
  <div style="${noCell}"><span style="font-size:10px;color:${BLUE}">No.</span></div>
  <div style="${labelCell}"><span style="font-size:10px;color:${BLUE}">${escapeHtml(group.title)} 科目</span></div>
  <div style="${amountCell}"><span style="font-size:10px;color:${BLUE}">金額 (円)</span></div>
</div>
${rowsHtml}
</div>`;
}

function buildPlHtml(
  amounts: Record<number, number | null>,
  labelOverrides: Record<number, string>,
): string {
  const sectionStyle = `width:${NO_W + LABEL_W + AMOUNT_W}px`;
  const columnHtml = (groups: PLGroup[]) =>
    groups
      .map((group) => buildGroupHtml(group, amounts, labelOverrides))
      .join("\n");

  return `<div style="display:flex;justify-content:center;gap:${COL_GAP}px">
  <div style="${sectionStyle}">${columnHtml(LEFT_GROUPS)}</div>
  <div style="${sectionStyle}">${columnHtml(CENTER_GROUPS)}</div>
  <div style="${sectionStyle}">${columnHtml(RIGHT_GROUPS)}</div>
</div>`;
}

function buildBsHtml(bsRows: ReadonlyArray<FsBsRow>): string {
  const thBase = `border:0.8px solid ${BLUE};background:${BLUE_LIGHT};color:${BLUE};padding:4px 5px;text-align:center;font-size:10px;font-weight:700;height:${BS_HEADER_H}px;`;
  const headers = ["資産の部", "期首", "期末", "負債・資本の部", "期首", "期末"]
    .map((header) => `<th style="${thBase}">${header}</th>`)
    .join("");

  const rowsHtml = bsRows
    .map((row) => {
      const cellBase = `border:0.8px solid ${BLUE};padding:3px 6px;font-size:10px;height:${BS_ROW_H}px;vertical-align:middle;background:white;font-weight:400;`;
      return `<tr>
  <td style="${cellBase};color:${BLUE}">${escapeHtml(row.assetLabel)}</td>
  <td style="${cellBase};color:${TEXT_DARK};text-align:right">${formatOptionalAmount(row.assetOpening)}</td>
  <td style="${cellBase};color:${TEXT_DARK};text-align:right">${formatOptionalAmount(row.assetClosing)}</td>
  <td style="${cellBase};color:${BLUE}">${escapeHtml(row.liabilityLabel)}</td>
  <td style="${cellBase};color:${TEXT_DARK};text-align:right">${formatOptionalAmount(row.liabilityOpening)}</td>
  <td style="${cellBase};color:${TEXT_DARK};text-align:right">${formatOptionalAmount(row.liabilityClosing)}</td>
</tr>`;
    })
    .join("\n");

  const totalW = BS_LABEL_W + BS_AMOUNT_W + BS_AMOUNT_W;
  return `<div style="display:flex;justify-content:center">
<table style="border-collapse:collapse;table-layout:fixed;width:${totalW * 2}px">
  <colgroup>
    <col style="width:${BS_LABEL_W}px"><col style="width:${BS_AMOUNT_W}px"><col style="width:${BS_AMOUNT_W}px">
    <col style="width:${BS_LABEL_W}px"><col style="width:${BS_AMOUNT_W}px"><col style="width:${BS_AMOUNT_W}px">
  </colgroup>
  <thead><tr>${headers}</tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</div>`;
}

export type FinancialStatementsArgs = {
  amounts: Record<number, number | null>;
  bsRows: ReadonlyArray<FsBsRow>;
  expenseWriteIns: ReadonlyArray<FsExpenseWriteIn>;
};

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const PAGE_SIDE_PADDING = 37;
const PAGE_TOP_PADDING = 11;
const PAGE_BOTTOM_PADDING = 16;
const PAGE_TITLE_FONT_SIZE = 16;
const PAGE_TITLE_GAP = 19;
const PAGE_BODY_TOP = PAGE_TOP_PADDING + PAGE_TITLE_FONT_SIZE + PAGE_TITLE_GAP;

export function buildFinancialStatementsBody(
  args: FinancialStatementsArgs,
): string {
  const { amounts, bsRows, expenseWriteIns } = args;
  const labelOverrides = writeInLabelOverrides(expenseWriteIns);

  return (
    buildLandscapePage(
      "損益計算書 (P/L)",
      buildPlHtml(amounts, labelOverrides),
      1,
    ) + buildLandscapePage("貸借対照表 (B/S)", buildBsHtml(bsRows), 2)
  );
}

function buildLandscapePage(
  title: string,
  bodyHtml: string,
  pageNumber: number,
): string {
  return `<div class="bk-page" style="position:relative;width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;overflow:hidden;">
<div style="position:absolute;top:${PAGE_TOP_PADDING}px;left:${PAGE_SIDE_PADDING}px;right:${PAGE_SIDE_PADDING}px;text-align:center;color:${BLUE};font-weight:700;font-size:${PAGE_TITLE_FONT_SIZE}px;line-height:1;">${escapeHtml(title)}</div>
<div style="position:absolute;top:${PAGE_BODY_TOP}px;left:${PAGE_SIDE_PADDING}px;right:${PAGE_SIDE_PADDING}px;">
${bodyHtml}
</div>
<div style="position:absolute;bottom:${PAGE_BOTTOM_PADDING}px;left:${PAGE_SIDE_PADDING}px;right:${PAGE_SIDE_PADDING}px;text-align:center;color:${BLUE};font-size:12px;line-height:1;">− ${pageNumber} −</div>
</div>`;
}

export function buildFinancialStatementsDocument(
  args: FinancialStatementsArgs,
): string {
  return buildPrintDocument({
    title: "財務諸表",
    orientation: "landscape",
    body: buildFinancialStatementsBody(args),
  });
}
