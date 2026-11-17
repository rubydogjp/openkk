export const PRINT_TABLE_FONT_SIZE = 10;
export const PORTRAIT_TABLE_HEIGHT_BUDGET = 1030;

const FULL_WIDTH_RATIO = 1;
const WIDE_HALF_WIDTH_RATIO = 0.95;
const HALF_WIDTH_RATIO = 0.66;
const WIDE_HALF_WIDTH_CHARACTERS = new Set(["M", "W", "m", "w", "@", "%"]);
const CELL_HORIZONTAL_ALLOWANCE = 11;
const WORD_SEPARATOR = " ";
const NO_BREAK_BEFORE = new Set([
  ...")]}:;,.!?%",
  ..."、。，．・：；？！）］｝〕〉》」』】ー々ゝゞぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ",
]);
const NO_BREAK_AFTER = new Set([..."([{（［｛〔〈《「『【"]);

export type PrintCellText = {
  text: string;
  columnWidth: number;
};

export type PrintRowMetrics = {
  lineHeight: number;
  verticalPadding: number;
};

export type PageItem<Item> = {
  item: Item;
  height: number;
  keepWithPrevious: boolean;
};

function isHalfWidth(codePoint: number): boolean {
  return codePoint <= 0x7e || (codePoint >= 0xff61 && codePoint <= 0xff9f);
}

function characterWidth(character: string, fontSize: number): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (!isHalfWidth(codePoint)) return fontSize * FULL_WIDTH_RATIO;
  return WIDE_HALF_WIDTH_CHARACTERS.has(character)
    ? fontSize * WIDE_HALF_WIDTH_RATIO
    : fontSize * HALF_WIDTH_RATIO;
}

function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const character of text) width += characterWidth(character, fontSize);
  return width;
}

function splitIntoBreakableUnits(text: string): string[] {
  const units: string[] = [];
  let pending = "";
  const flush = () => {
    if (pending !== "") units.push(pending);
    pending = "";
  };
  let previous = "";
  for (const character of text.replace(/\s+/g, WORD_SEPARATOR)) {
    const codePoint = character.codePointAt(0) ?? 0;
    const joinsPrevious =
      NO_BREAK_BEFORE.has(character) || NO_BREAK_AFTER.has(previous);
    if (character === WORD_SEPARATOR) {
      flush();
      units.push(WORD_SEPARATOR);
    } else if (joinsPrevious) {
      if (pending === "" && units.length > 0) {
        const last = units.pop()!;
        pending = last === WORD_SEPARATOR ? character : last + character;
        if (last === WORD_SEPARATOR) units.push(WORD_SEPARATOR);
      } else {
        pending += character;
      }
    } else if (
      isHalfWidth(codePoint) &&
      pending !== "" &&
      isHalfWidth(pending.codePointAt(pending.length - 1) ?? 0)
    ) {
      pending += character;
    } else {
      flush();
      pending = character;
    }
    previous = character;
  }
  flush();
  return units;
}

export function estimateWrappedLineCount(
  text: string,
  columnWidth: number,
  fontSize: number,
): number {
  const trimmed = text.trim();
  if (trimmed === "") return 1;
  const lineWidth = Math.max(fontSize, columnWidth - CELL_HORIZONTAL_ALLOWANCE);
  let lines = 1;
  let used = 0;
  for (const unit of splitIntoBreakableUnits(trimmed)) {
    const width = textWidth(unit, fontSize);
    if (unit === WORD_SEPARATOR) {
      used += width;
      continue;
    }
    if (width > lineWidth) {
      if (used > 0) lines += 1;
      lines += Math.ceil(width / lineWidth) - 1;
      used = width % lineWidth;
      continue;
    }
    if (used + width > lineWidth) {
      lines += 1;
      used = width;
    } else {
      used += width;
    }
  }
  return lines;
}

export function estimateRowHeight(
  cells: ReadonlyArray<PrintCellText>,
  metrics: PrintRowMetrics,
): number {
  const lines = Math.max(
    1,
    ...cells.map((cell) =>
      estimateWrappedLineCount(
        cell.text,
        cell.columnWidth,
        PRINT_TABLE_FONT_SIZE,
      ),
    ),
  );
  return Math.ceil(lines * metrics.lineHeight) + metrics.verticalPadding + 1;
}

export function packItemsIntoPages<Item>(
  items: ReadonlyArray<PageItem<Item>>,
  budget: number,
): Item[][] {
  const pages: PageItem<Item>[][] = [];
  let current: PageItem<Item>[] = [];
  let used = 0;
  for (const pageItem of items) {
    if (current.length === 0 || used + pageItem.height <= budget) {
      current.push(pageItem);
      used += pageItem.height;
      continue;
    }
    const carried: PageItem<Item>[] = [];
    if (pageItem.keepWithPrevious) {
      while (current.length > 1) {
        const last = current.pop()!;
        carried.unshift(last);
        if (!last.keepWithPrevious) break;
      }
    }
    pages.push(current);
    current = [...carried, pageItem];
    used = current.reduce((sum, item) => sum + item.height, 0);
  }
  if (current.length > 0) pages.push(current);
  return pages.map((page) => page.map((pageItem) => pageItem.item));
}
