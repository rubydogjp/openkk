import { serverValidationError } from "./app-error.js";

export const MAX_FISCAL_PERIOD_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES = 32 * 1024 * 1024;

export function assertFiscalPeriodArchiveSize(sections: readonly unknown[]): void {
  const encoder = new TextEncoder();
  let totalBytes = 0;
  for (const section of sections) {
    const bytes = encoder.encode(JSON.stringify(section)).byteLength;
    totalBytes += bytes;
    if (
      bytes > MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES ||
      totalBytes > MAX_FISCAL_PERIOD_ARCHIVE_BYTES
    ) {
      throw serverValidationError(
        "Fiscal period archive exceeds the size limit",
        "圧縮済みファイルのデータ容量が大きすぎます",
      );
    }
  }
}
