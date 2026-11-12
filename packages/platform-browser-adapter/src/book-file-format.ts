export const OPENKK_BOOK_EXTENSION = ".openkk";
export const OPENKK_BOOK_MIME_TYPE = "application/x-openkk";

const UNSAFE_FILE_NAME_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const EMPTY_BOOK_NAME = "帳簿";

export function isBookFileName(name: string): boolean {
  return name.endsWith(OPENKK_BOOK_EXTENSION);
}

export function bookFileName(fiscalPeriodName: string): string {
  const safe = fiscalPeriodName
    .replace(UNSAFE_FILE_NAME_CHARACTERS, "_")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  return `${safe === "" ? EMPTY_BOOK_NAME : safe}${OPENKK_BOOK_EXTENSION}`;
}
