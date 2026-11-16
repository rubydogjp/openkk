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

const LEGACY_DATABASE = { vfsName: "openkk", dbFileName: "openkk.sqlite3" };
const MOVED_MARKER_NAME = "openkk-legacy-book-moved";
const UNMOVED_FISCAL_PERIODS_KEY = "openkk.legacy-book.unmoved-fiscal-periods";

export type LegacyBookMarker = {
  isMoved(): Promise<boolean>;
  markMoved(): Promise<void>;
};

export type LegacyUnmovedFiscalPeriodsRecord = {
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
};

export type LegacyBookMove = {
  movedFiscalPeriodIds: string[];
  unmovedFiscalPeriods: OpenkkFiscalPeriodLabel[];
};

export type LegacyBookDependencies = {
  marker: LegacyBookMarker;
  unmovedFiscalPeriodsRecord: LegacyUnmovedFiscalPeriodsRecord;
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
        };
      }
      const bytes = await dependencies.exportLegacyDatabase(
        onWaitingForAnotherTab,
      );
      const { periods, unmovedFiscalPeriods } =
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
      await dependencies.marker.markMoved();
      return { movedFiscalPeriodIds, unmovedFiscalPeriods };
    },
  };
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function parseUnmovedFiscalPeriods(
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

export function createLegacyUnmovedFiscalPeriodsRecord(
  storage: PlatformKeyValueStorage,
): LegacyUnmovedFiscalPeriodsRecord {
  return {
    read: () =>
      parseUnmovedFiscalPeriods(storage.getItem(UNMOVED_FISCAL_PERIODS_KEY)),
    write(periods) {
      if (periods.length === 0) {
        storage.removeItem(UNMOVED_FISCAL_PERIODS_KEY);
        return;
      }
      storage.setItem(UNMOVED_FISCAL_PERIODS_KEY, JSON.stringify(periods));
    },
  };
}

export async function splitLegacyDatabaseIntoPeriods(
  bytes: Uint8Array,
): Promise<LegacyBookSplit> {
  const { periods, unreadable } = await splitReadableBookFilePeriods(bytes);
  return {
    periods: periods.map((period) => ({
      fiscalPeriodId: period.fiscalPeriod.id,
      bytes: period.bytes,
    })),
    unmovedFiscalPeriods: unreadable.map(({ name, startDate, endDate }) => ({
      name,
      startDate,
      endDate,
    })),
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
  async exportLegacyDatabase(onWaitingForAnotherTab) {
    if (!(await hasLegacyDbStorage(LEGACY_DATABASE.vfsName))) return null;
    return exportLegacyDbBytes({ ...LEGACY_DATABASE, onWaitingForAnotherTab });
  },
  splitIntoPeriods: splitLegacyDatabaseIntoPeriods,
  storedFiscalPeriodIds: readStoredFiscalPeriodIds,
  newBookName: newInAppBookName,
});
