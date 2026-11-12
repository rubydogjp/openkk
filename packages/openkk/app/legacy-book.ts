import {
  readStoredFiscalPeriodIds,
  splitBookFile,
  type BookStore,
} from "@rubydogjp/openkk-books-db-adapter";
import {
  exportFileDbBytes,
  hasFileDbStorage,
} from "@rubydogjp/openkk-file-db-adapter";
import { newInAppBookName } from "@rubydogjp/openkk-platform-browser-adapter";

const LEGACY_DATABASE = { vfsName: "openkk", dbFileName: "openkk.sqlite3" };
const MOVED_MARKER_NAME = "openkk-legacy-book-moved";

export type LegacyBookMarker = {
  isMoved(): Promise<boolean>;
  markMoved(): Promise<void>;
};

export type LegacyBookPeriod = {
  fiscalPeriodId: string;
  bytes: Uint8Array;
};

export type LegacyBookDependencies = {
  marker: LegacyBookMarker;
  exportLegacyDatabase(
    onWaitingForAnotherTab: () => void,
  ): Promise<Uint8Array | null>;
  splitIntoPeriods(bytes: Uint8Array): Promise<LegacyBookPeriod[]>;
  storedFiscalPeriodIds(store: BookStore): Promise<Set<string>>;
  newBookName(): string;
};

export type LegacyBook = {
  moveInto(
    store: BookStore,
    onWaitingForAnotherTab: () => void,
  ): Promise<string[]>;
};

export function createLegacyBook(
  dependencies: LegacyBookDependencies,
): LegacyBook {
  return {
    async moveInto(store, onWaitingForAnotherTab) {
      if (await dependencies.marker.isMoved()) return [];
      const bytes = await dependencies.exportLegacyDatabase(
        onWaitingForAnotherTab,
      );
      const periods =
        bytes == null ? [] : await dependencies.splitIntoPeriods(bytes);
      const stored =
        periods.length === 0
          ? new Set<string>()
          : await dependencies.storedFiscalPeriodIds(store);
      const moved: string[] = [];
      for (const period of periods) {
        if (stored.has(period.fiscalPeriodId)) continue;
        await store.write(dependencies.newBookName(), period.bytes);
        moved.push(period.fiscalPeriodId);
      }
      await dependencies.marker.markMoved();
      return moved;
    },
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
  async exportLegacyDatabase(onWaitingForAnotherTab) {
    if (!(await hasFileDbStorage(LEGACY_DATABASE.vfsName))) return null;
    return exportFileDbBytes({ ...LEGACY_DATABASE, onWaitingForAnotherTab });
  },
  async splitIntoPeriods(bytes) {
    return (await splitBookFile(bytes)).map((period) => ({
      fiscalPeriodId: period.fiscalPeriod.id,
      bytes: period.bytes,
    }));
  },
  storedFiscalPeriodIds: readStoredFiscalPeriodIds,
  newBookName: newInAppBookName,
});
