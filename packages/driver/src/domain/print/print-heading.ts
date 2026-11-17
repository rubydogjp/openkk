import { formatIsoLocalDate } from "../shared/parse-utils.js";
import { formatPrintDate } from "./print-format.js";
import { escapeHtml } from "./print-shell.js";

export const PRINT_HEADING_ROW_HEIGHT = 16;
export const PROVISIONAL_REPORT_MARK = "決算前";

const HEADING_FONT_SIZE = 10;
const MAX_PERIOD_NAME_CHARACTERS = 30;
const SHORTENED_MARK = "…";
const HEADING_COLOR = "#334155";
const MARK_COLOR = "#B45309";

export type PrintHeading = {
  periodLabel: string;
  preparedOnLabel: string;
  provisional: boolean;
};

export function buildPrintHeading(input: {
  fiscalPeriodName: string;
  startDate: string;
  endDate: string;
  preparedOn: Date;
  provisional: boolean;
}): PrintHeading {
  return {
    periodLabel: `${shortenedPeriodName(input.fiscalPeriodName)} (${formatPrintDate(input.startDate)}〜${formatPrintDate(input.endDate)})`,
    preparedOnLabel: `作成日 ${formatPrintDate(formatIsoLocalDate(input.preparedOn))}`,
    provisional: input.provisional,
  };
}

function shortenedPeriodName(name: string): string {
  const characters = [...name.trim()];
  return characters.length <= MAX_PERIOD_NAME_CHARACTERS
    ? characters.join("")
    : `${characters.slice(0, MAX_PERIOD_NAME_CHARACTERS - 1).join("")}${SHORTENED_MARK}`;
}

export function printHeadingRowHtml(
  heading: PrintHeading,
  top: number,
  sidePadding: number,
): string {
  return `<div style="position:absolute;top:${top}px;left:${sidePadding}px;right:${sidePadding}px;display:flex;justify-content:space-between;gap:16px;color:${HEADING_COLOR};font-size:${HEADING_FONT_SIZE}px;line-height:1;">
<span style="white-space:nowrap;">${escapeHtml(heading.periodLabel)}</span>
<span style="flex-shrink:0;white-space:nowrap;">${escapeHtml(heading.preparedOnLabel)}</span>
</div>`;
}

export function printTitleHtml(title: string, heading: PrintHeading): string {
  const mark = heading.provisional
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 6px;border:1px solid ${MARK_COLOR};border-radius:3px;color:${MARK_COLOR};font-size:11px;font-weight:700;line-height:1;vertical-align:2px;">${PROVISIONAL_REPORT_MARK}</span>`
    : "";
  return `${escapeHtml(title)}${mark}`;
}
