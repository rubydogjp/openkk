import type { PlatformKeyValueStorage } from "@rubydogjp/openkk-client-ports";

export type BookSaveRecord = { savedAt: number; lastChangedAt: number };

export type BookSaveRecords = {
  read(fiscalPeriodId: string): BookSaveRecord | null;
  write(fiscalPeriodId: string, record: BookSaveRecord): void;
  forget(fiscalPeriodId: string): void;
};

const SAVE_RECORD_KEY_PREFIX = "openkk.book-save:";

function parseRecord(text: string | null): BookSaveRecord | null {
  if (text == null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed == null) return null;
    const { savedAt, lastChangedAt } = parsed as Record<string, unknown>;
    return typeof savedAt === "number" && typeof lastChangedAt === "number"
      ? { savedAt, lastChangedAt }
      : null;
  } catch {
    return null;
  }
}

export function createBookSaveRecords(
  storage: PlatformKeyValueStorage,
): BookSaveRecords {
  const keyOf = (fiscalPeriodId: string) =>
    `${SAVE_RECORD_KEY_PREFIX}${fiscalPeriodId}`;
  return {
    read: (fiscalPeriodId) =>
      parseRecord(storage.getItem(keyOf(fiscalPeriodId))),
    write(fiscalPeriodId, record) {
      storage.setItem(keyOf(fiscalPeriodId), JSON.stringify(record));
    },
    forget(fiscalPeriodId) {
      storage.removeItem(keyOf(fiscalPeriodId));
    },
  };
}
