import { AppError } from "../shared/app-error.js";

export const MAX_JOURNAL_IMPORT_SIZE = 16 * 1024 * 1024;
export const MAX_JOURNAL_IMPORT_ENTRIES = 10_000;
export const MAX_JOURNAL_IMPORT_LINES = 100_000;
export const MAX_JOURNAL_ENTRY_LINES = 1_000;

export function assertJournalImportSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_JOURNAL_IMPORT_SIZE) {
    throw importFileLimitError("journal import exceeds the size limit");
  }
}

export function assertJournalImportEntryCount(count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_JOURNAL_IMPORT_ENTRIES
  ) {
    throw importFileLimitError("journal import contains too many entries");
  }
}

export function assertJournalEntryLineCount(count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_JOURNAL_ENTRY_LINES
  ) {
    throw importFileLimitError("journal entry contains too many lines");
  }
}

export function assertJournalImportLineCount(count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_JOURNAL_IMPORT_LINES
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
  });
}
