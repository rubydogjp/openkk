import {
  readStoredFiscalPeriodIds,
  splitReadableBookFilePeriods,
  type BookStore,
} from "@rubydogjp/openkk-books-db-adapter";
import {
  exportLegacyDbBytes,
  hasLegacyDbStorage,
} from "@rubydogjp/openkk-legacy-db-adapter";
import {
  browserPlatformAdapter,
  newInAppBookName,
} from "@rubydogjp/openkk-browser-platform-adapter";
import type {
  OpenkkFiscalPeriodLabel,
  PlatformKeyValueStorage,
} from "@rubydogjp/openkk-driver";
import type {
  LegacyBookChangeSet,
  LegacyBookWatch,
} from "@rubydogjp/openkk-local-book-files-adapter";

import { mergeLegacyDuplicatePeriods } from "./legacy-duplicate-periods";
import {
  fingerprintBytes,
  fingerprintPeriodContent,
} from "./legacy-fingerprint";

const LEGACY_DATABASE = { vfsName: "openkk", dbFileName: "openkk.sqlite3" };
const MOVED_MARKER_NAME = "openkk-legacy-book-moved";
const UNMOVED_FISCAL_PERIODS_KEY = "openkk.legacy-book.unmoved-fiscal-periods";
const MERGED_FISCAL_PERIODS_KEY = "openkk.legacy-book.merged-fiscal-periods";
const WATCH_RECORD_KEY = "openkk.legacy-book.watch";

export type LegacyBookMarker = {
  isMoved(): Promise<boolean>;
  markMoved(): Promise<void>;
};

export type LegacyFiscalPeriodsRecord = {
  read(): OpenkkFiscalPeriodLabel[];
  write(periods: readonly OpenkkFiscalPeriodLabel[]): void;
};

export type LegacyBookPeriod = {
  fiscalPeriodId: string;
  label: OpenkkFiscalPeriodLabel;
  fingerprint: string;
  bookLastChangedAt: number;
  bytes: Uint8Array;
};

export type LegacyBookWatchedPeriod = {
  fiscalPeriodId: string;
  label: OpenkkFiscalPeriodLabel;
  fingerprint: string;
  movedLastChangedAt: number | null;
};

export type LegacyBookWatchRecord = {
  databaseFingerprint: string;
  periods: LegacyBookWatchedPeriod[];
};

export type LegacyBookWatchRecordStore = {
  read(): LegacyBookWatchRecord | null;
  write(record: LegacyBookWatchRecord): void;
};

export type LegacyBookSplit = {
  periods: LegacyBookPeriod[];
  unmovedFiscalPeriods: OpenkkFiscalPeriodLabel[];
  mergedFiscalPeriods: OpenkkFiscalPeriodLabel[];
};

export type LegacyBookMove = {
  movedFiscalPeriodIds: string[];
  unmovedFiscalPeriods: OpenkkFiscalPeriodLabel[];
  mergedFiscalPeriods: OpenkkFiscalPeriodLabel[];
};

export type LegacyBookDependencies = {
  marker: LegacyBookMarker;
  unmovedFiscalPeriodsRecord: LegacyFiscalPeriodsRecord;
  mergedFiscalPeriodsRecord: LegacyFiscalPeriodsRecord;
  watchRecord: LegacyBookWatchRecordStore;
  fingerprintDatabase(bytes: Uint8Array): Promise<string>;
  exportLegacyDatabase(
    onWaitingForAnotherTab: () => void,
  ): Promise<Uint8Array | null>;
  splitIntoPeriods(bytes: Uint8Array): Promise<LegacyBookSplit>;
  storedFiscalPeriodIds(store: BookStore): Promise<Set<string>>;
  newBookName(): string;
};

export type LegacyBook = LegacyBookWatch & {
  moveInto(
    store: BookStore,
    onWaitingForAnotherTab: () => void,
  ): Promise<LegacyBookMove>;
};

function watchedPeriods(
  periods: readonly LegacyBookPeriod[],
  movedLastChangedAt: (period: LegacyBookPeriod) => number | null,
): LegacyBookWatchedPeriod[] {
  return periods.map((period) => ({
    fiscalPeriodId: period.fiscalPeriodId,
    label: period.label,
    fingerprint: period.fingerprint,
    movedLastChangedAt: movedLastChangedAt(period),
  }));
}

function writeWatchRecordQuietly(
  store: LegacyBookWatchRecordStore,
  record: LegacyBookWatchRecord,
): void {
  try {
    store.write(record);
  } catch (error) {
    console.error(
      "[openkk] the previous version's data could not be remembered:",
      error,
    );
  }
}

const NOTHING_TO_SPLIT: LegacyBookSplit = {
  periods: [],
  unmovedFiscalPeriods: [],
  mergedFiscalPeriods: [],
};

export function createLegacyBook(
  dependencies: LegacyBookDependencies,
): LegacyBook {
  return {
    async moveInto(store, onWaitingForAnotherTab) {
      if (await dependencies.marker.isMoved()) {
        return {
          movedFiscalPeriodIds: [],
          unmovedFiscalPeriods: dependencies.unmovedFiscalPeriodsRecord.read(),
          mergedFiscalPeriods: dependencies.mergedFiscalPeriodsRecord.read(),
        };
      }
      const bytes = await dependencies.exportLegacyDatabase(
        onWaitingForAnotherTab,
      );
      const { periods, unmovedFiscalPeriods, mergedFiscalPeriods } =
        bytes == null
          ? NOTHING_TO_SPLIT
          : await dependencies.splitIntoPeriods(bytes);
      const stored =
        periods.length === 0
          ? new Set<string>()
          : await dependencies.storedFiscalPeriodIds(store);
      const movedFiscalPeriodIds: string[] = [];
      for (const period of periods) {
        if (stored.has(period.fiscalPeriodId)) continue;
        await store.write(dependencies.newBookName(), period.bytes);
        movedFiscalPeriodIds.push(period.fiscalPeriodId);
      }
      dependencies.unmovedFiscalPeriodsRecord.write(unmovedFiscalPeriods);
      dependencies.mergedFiscalPeriodsRecord.write(mergedFiscalPeriods);
      if (bytes != null) {
        const moved = new Set(movedFiscalPeriodIds);
        dependencies.watchRecord.write({
          databaseFingerprint: await dependencies.fingerprintDatabase(bytes),
          periods: watchedPeriods(periods, (period) =>
            moved.has(period.fiscalPeriodId) ? period.bookLastChangedAt : null,
          ),
        });
      }
      await dependencies.marker.markMoved();
      return {
        movedFiscalPeriodIds,
        unmovedFiscalPeriods,
        mergedFiscalPeriods,
      };
    },
    async detectChanges(): Promise<LegacyBookChangeSet | null> {
      if (!(await dependencies.marker.isMoved())) return null;
      const bytes = await dependencies.exportLegacyDatabase(() => {});
      if (bytes == null) return null;
      const databaseFingerprint = await dependencies.fingerprintDatabase(bytes);
      const record = dependencies.watchRecord.read();
      if (record?.databaseFingerprint === databaseFingerprint) return null;
      const { periods } = await dependencies.splitIntoPeriods(bytes);
      const known = new Map(
        (record?.periods ?? []).map((period) => [
          period.fiscalPeriodId,
          period,
        ]),
      );
      const recordWith = (
        movedLastChangedAt: ReadonlyMap<string, number>,
      ): LegacyBookWatchRecord => ({
        databaseFingerprint,
        periods: watchedPeriods(
          periods,
          (period) =>
            movedLastChangedAt.get(period.fiscalPeriodId) ??
            known.get(period.fiscalPeriodId)?.movedLastChangedAt ??
            null,
        ),
      });
      if (record == null) {
        writeWatchRecordQuietly(
          dependencies.watchRecord,
          recordWith(new Map()),
        );
        return null;
      }
      const present = new Set(periods.map((period) => period.fiscalPeriodId));
      const changed = periods.filter(
        (period) =>
          known.get(period.fiscalPeriodId)?.fingerprint !== period.fingerprint,
      );
      const removed = record.periods.filter(
        (period) => !present.has(period.fiscalPeriodId),
      );
      if (changed.length === 0 && removed.length === 0) {
        writeWatchRecordQuietly(
          dependencies.watchRecord,
          recordWith(new Map()),
        );
        return null;
      }
      return {
        changed: changed.map((period) => ({
          fiscalPeriodId: period.fiscalPeriodId,
          label: period.label,
          bytes: period.bytes,
          movedLastChangedAt:
            known.get(period.fiscalPeriodId)?.movedLastChangedAt ?? null,
        })),
        removed: removed.map((period) => period.label),
        accept(movedLastChangedAt) {
          dependencies.watchRecord.write(recordWith(movedLastChangedAt));
        },
      };
    },
  };
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function parseFiscalPeriodLabels(
  stored: string | null,
): OpenkkFiscalPeriodLabel[] {
  if (stored == null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      name: textOrNull(item.name),
      startDate: textOrNull(item.startDate),
      endDate: textOrNull(item.endDate),
    }));
}

function createLegacyFiscalPeriodsRecord(
  storage: PlatformKeyValueStorage,
  key: string,
  listName: string,
): LegacyFiscalPeriodsRecord {
  return {
    read: () => parseFiscalPeriodLabels(storage.getItem(key)),
    write(periods) {
      const stored = periods.length === 0 ? null : JSON.stringify(periods);
      if (stored == null) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, stored);
      }
      if (storage.getItem(key) !== stored) {
        throw new Error(`the list of ${listName} was not stored`);
      }
    },
  };
}

function parseWatchedPeriod(value: unknown): LegacyBookWatchedPeriod | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const label =
    typeof item.label === "object" && item.label !== null
      ? (item.label as Record<string, unknown>)
      : null;
  const movedLastChangedAt = item.movedLastChangedAt;
  if (
    typeof item.fiscalPeriodId !== "string" ||
    typeof item.fingerprint !== "string" ||
    label == null ||
    (movedLastChangedAt !== null &&
      !(
        typeof movedLastChangedAt === "number" &&
        Number.isSafeInteger(movedLastChangedAt)
      ))
  ) {
    return null;
  }
  return {
    fiscalPeriodId: item.fiscalPeriodId,
    fingerprint: item.fingerprint,
    label: {
      name: textOrNull(label.name),
      startDate: textOrNull(label.startDate),
      endDate: textOrNull(label.endDate),
    },
    movedLastChangedAt,
  };
}

function parseWatchRecord(stored: string | null): LegacyBookWatchRecord | null {
  if (stored == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { databaseFingerprint, periods } = parsed as Record<string, unknown>;
  if (typeof databaseFingerprint !== "string" || !Array.isArray(periods)) {
    return null;
  }
  const watched = periods.map(parseWatchedPeriod);
  if (watched.some((period) => period == null)) return null;
  return {
    databaseFingerprint,
    periods: watched.filter((period) => period != null),
  };
}

export function createLegacyBookWatchRecordStore(
  storage: PlatformKeyValueStorage,
): LegacyBookWatchRecordStore {
  return {
    read: () => parseWatchRecord(storage.getItem(WATCH_RECORD_KEY)),
    write(record) {
      const stored = JSON.stringify(record);
      storage.setItem(WATCH_RECORD_KEY, stored);
      if (storage.getItem(WATCH_RECORD_KEY) !== stored) {
        throw new Error("the previous version's data was not remembered");
      }
    },
  };
}

export function createLegacyUnmovedFiscalPeriodsRecord(
  storage: PlatformKeyValueStorage,
): LegacyFiscalPeriodsRecord {
  return createLegacyFiscalPeriodsRecord(
    storage,
    UNMOVED_FISCAL_PERIODS_KEY,
    "fiscal periods that could not be moved",
  );
}

export function createLegacyMergedFiscalPeriodsRecord(
  storage: PlatformKeyValueStorage,
): LegacyFiscalPeriodsRecord {
  return createLegacyFiscalPeriodsRecord(
    storage,
    MERGED_FISCAL_PERIODS_KEY,
    "fiscal periods merged into another of the same dates",
  );
}

function fiscalPeriodLabel(period: {
  name: string | null;
  startDate: string | null;
  endDate: string | null;
}): OpenkkFiscalPeriodLabel {
  return {
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
  };
}

export async function splitLegacyDatabaseIntoPeriods(
  bytes: Uint8Array,
): Promise<LegacyBookSplit> {
  const { periods, unreadable } = await splitReadableBookFilePeriods(bytes);
  const { kept, merged } = mergeLegacyDuplicatePeriods(periods);
  const keptPeriods: LegacyBookPeriod[] = [];
  for (const period of kept) {
    keptPeriods.push({
      fiscalPeriodId: period.fiscalPeriod.id,
      label: fiscalPeriodLabel(period.fiscalPeriod),
      fingerprint: await fingerprintPeriodContent(period),
      bookLastChangedAt: period.bookLastChangedAt,
      bytes: period.bytes,
    });
  }
  return {
    periods: keptPeriods,
    unmovedFiscalPeriods: unreadable.map(fiscalPeriodLabel),
    mergedFiscalPeriods: merged.map((period) =>
      fiscalPeriodLabel(period.fiscalPeriod),
    ),
  };
}

type MarkerDirectory = {
  getFileHandle(name: string, options: { create: boolean }): Promise<unknown>;
};

async function storageRoot(): Promise<MarkerDirectory> {
  return (await navigator.storage.getDirectory()) as unknown as MarkerDirectory;
}

const storageRootMarker: LegacyBookMarker = {
  async isMoved() {
    try {
      await (
        await storageRoot()
      ).getFileHandle(MOVED_MARKER_NAME, { create: false });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return false;
      }
      throw error;
    }
  },
  async markMoved() {
    await (
      await storageRoot()
    ).getFileHandle(MOVED_MARKER_NAME, { create: true });
  },
};

export const legacyBook = createLegacyBook({
  marker: storageRootMarker,
  unmovedFiscalPeriodsRecord: createLegacyUnmovedFiscalPeriodsRecord(
    browserPlatformAdapter.storage,
  ),
  mergedFiscalPeriodsRecord: createLegacyMergedFiscalPeriodsRecord(
    browserPlatformAdapter.storage,
  ),
  watchRecord: createLegacyBookWatchRecordStore(browserPlatformAdapter.storage),
  fingerprintDatabase: fingerprintBytes,
  async exportLegacyDatabase(onWaitingForAnotherTab) {
    if (!(await hasLegacyDbStorage(LEGACY_DATABASE.vfsName))) return null;
    return exportLegacyDbBytes({ ...LEGACY_DATABASE, onWaitingForAnotherTab });
  },
  splitIntoPeriods: splitLegacyDatabaseIntoPeriods,
  storedFiscalPeriodIds: readStoredFiscalPeriodIds,
  newBookName: newInAppBookName,
});
