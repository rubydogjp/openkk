import { AppError } from "../shared/app-error.js";

export const MAX_ENTRY_IMPORT_SIZE = 16 * 1024 * 1024;
export const MAX_ENTRY_IMPORT_ITEMS = 10_000;
export const MAX_ENTRY_IMPORT_LINES = 100_000;
export const MAX_ENTRY_LINES = 1_000;

export function assertEntryImportSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENTRY_IMPORT_SIZE) {
    throw importFileLimitError("journal import exceeds the size limit");
  }
}

export function assertEntryImportItemCount(count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_ENTRY_IMPORT_ITEMS
  ) {
    throw importFileLimitError("journal import contains too many entries");
  }
}

export function assertEntryLineCount(count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_ENTRY_LINES
  ) {
    throw importFileLimitError("journal entry contains too many lines");
  }
}

export function assertEntryImportLineCount(count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_ENTRY_IMPORT_LINES
  ) {
    throw importFileLimitError("journal import contains too many lines");
  }
}

function importFileLimitError(messageForDeveloper: string): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser:
      "取込ファイルが大きすぎます。ファイルを分割してからもう一度取り込んでください。",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
