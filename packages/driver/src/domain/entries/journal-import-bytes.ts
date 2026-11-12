import { AppError } from "../shared/app-error.js";
import { assertEntryImportSize } from "./entry-limits.js";

export {
  assertEntryImportSize,
  MAX_ENTRY_LINES,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_IMPORT_SIZE,
} from "./entry-limits.js";

export function decodeJournalImportBytes(bytes: Uint8Array): string {
  assertEntryImportSize(bytes.byteLength);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new AppError({
      messageForDeveloper: "entries import is not valid UTF-8",
      messageForUser:
        "取込ファイルの文字コードを確認できませんでした。UTF-8形式で保存してからもう一度取り込んでください。",
      originalMessage: error instanceof Error ? error.message : String(error),
      statusCode: null,
      code: null,
    });
  }
}
