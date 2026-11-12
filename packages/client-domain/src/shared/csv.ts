import { AppError } from "./app-error.js";

const BYTE_ORDER_MARK = "﻿";
const FORMULA_START = /^[=+\-@\t\r\n]/;

export function stripByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
}

export function formatCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return `${BYTE_ORDER_MARK}${rows.map(formatCsvLine).join("\n")}\n`;
}

export function protectSpreadsheetFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export function unprotectSpreadsheetFormula(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1))
    ? value.slice(1)
    : value;
}

function formatCsvLine(values: ReadonlyArray<string>): string {
  return values.map(escapeCsvField).join(",");
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: "start" | "unquoted" | "quoted" | "after_quote" = "start";

  const finishField = () => {
    row.push(field);
    field = "";
    state = "start";
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (state === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          state = "after_quote";
        }
      } else {
        field += character;
      }
      continue;
    }

    const isLineBreak = character === "\n" || character === "\r";
    if (state === "after_quote") {
      if (character === ",") {
        finishField();
        continue;
      }
      if (isLineBreak) {
        finishRow();
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        continue;
      }
      throw csvFormatError(
        "CSV has an unexpected character after a closing quote",
      );
    }

    if (character === '"') {
      if (state !== "start") {
        throw csvFormatError(
          "CSV has an unexpected quote in an unquoted field",
        );
      }
      state = "quoted";
      continue;
    }
    if (character === ",") {
      finishField();
      continue;
    }
    if (isLineBreak) {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      continue;
    }
    field += character;
    state = "unquoted";
  }
  if (state === "quoted") {
    throw csvFormatError("CSV has an unterminated quoted field");
  }
  finishRow();
  return rows;
}

export function isBlankCsvRow(cells: ReadonlyArray<string>): boolean {
  return cells.every((cell) => cell.trim() === "");
}

function csvFormatError(messageForDeveloper: string): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser:
      "CSVファイルの形式を確認できませんでした。オープン会計で書き出したCSVか、同じ列のCSVを選んでください。",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
