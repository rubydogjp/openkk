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

import { mergeLegacyDuplicatePeriods } from "./legacy-duplicate-periods";

const LEGACY_DATABASE = { vfsName: "openkk", dbFileName: "openkk.sqlite3" };
const MOVED_MARKER_NAME = "openkk-legacy-book-moved";
const UNMOVED_FISCAL_PERIODS_KEY = "openkk.legacy-book.unmoved-fiscal-periods";
const MERGED_FISCAL_PERIODS_KEY = "openkk.legacy-book.merged-fiscal-periods";

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
  bytes: Uint8Array;
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
  exportLegacyDatabase(
    onWaitingForAnotherTab: () => void,
  ): Promise<Uint8Array | null>;
  splitIntoPeriods(bytes: Uint8Array): Promise<LegacyBookSplit>;
  storedFiscalPeriodIds(store: BookStore): Promise<Set<string>>;
  newBookName(): string;
};

export type LegacyBook = {
  moveInto(
    store: BookStore,
    onWaitingForAnotherTab: () => void,
  ): Promise<LegacyBookMove>;
};

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
      await dependencies.marker.markMoved();
      return {
        movedFiscalPeriodIds,
        unmovedFiscalPeriods,
        mergedFiscalPeriods,
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
  return {
    periods: kept.map((period) => ({
      fiscalPeriodId: period.fiscalPeriod.id,
      bytes: period.bytes,
    })),
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
  async exportLegacyDatabase(onWaitingForAnotherTab) {
    if (!(await hasLegacyDbStorage(LEGACY_DATABASE.vfsName))) return null;
    return exportLegacyDbBytes({ ...LEGACY_DATABASE, onWaitingForAnotherTab });
  },
  splitIntoPeriods: splitLegacyDatabaseIntoPeriods,
  storedFiscalPeriodIds: readStoredFiscalPeriodIds,
  newBookName: newInAppBookName,
});
