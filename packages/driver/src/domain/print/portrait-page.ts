import { escapeHtml } from "./print-shell.js";

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const SIDE_PADDING = 27;
const TOP_PADDING = 11;
const BOTTOM_PADDING = 19;
const TITLE_FONT_SIZE = 16;
const TITLE_GAP = 19;
const BODY_TOP = TOP_PADDING + TITLE_FONT_SIZE + TITLE_GAP;

export function buildPortraitPage(
  title: string,
  bodyHtml: string,
  pageNumber: number,
): string {
  return `<div class="bk-page" style="position:relative;width:${PAGE_WIDTH}px;min-height:${PAGE_HEIGHT}px;height:auto;overflow:visible;padding-bottom:${BOTTOM_PADDING + 24}px;">
<div style="position:absolute;top:${TOP_PADDING}px;left:${SIDE_PADDING}px;right:${SIDE_PADDING}px;text-align:center;color:#1D4ED8;font-weight:700;font-size:${TITLE_FONT_SIZE}px;line-height:1;">${escapeHtml(title)}</div>
<div style="position:absolute;top:${BODY_TOP}px;left:${SIDE_PADDING}px;right:${SIDE_PADDING}px;">
${bodyHtml}
</div>
<div style="position:absolute;bottom:${BOTTOM_PADDING}px;left:${SIDE_PADDING}px;right:${SIDE_PADDING}px;text-align:center;color:#1D4ED8;font-size:12px;line-height:1;">− ${pageNumber} −</div>
</div>`;
}
