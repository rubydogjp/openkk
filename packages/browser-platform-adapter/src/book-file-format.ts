import { buildFiscalPeriodBookFilename } from "@rubydogjp/openkk-driver";

export const OPENKK_BOOK_EXTENSION = ".openkk";
export const OPENKK_BOOK_MIME_TYPE = "application/x-openkk";

export function isBookFileName(name: string): boolean {
  return name.endsWith(OPENKK_BOOK_EXTENSION);
}

export function bookFileName(fiscalPeriodName: string): string {
  return buildFiscalPeriodBookFilename({ name: fiscalPeriodName });
}
