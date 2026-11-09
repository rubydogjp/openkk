import {
  exportFileDbBytes,
  hasFileDbStorage,
} from "@rubydogjp/openkk-file-db-adapter";
import {
  NEW_OPENKK_DOCUMENT_NAME,
  type BookPlace,
} from "@rubydogjp/openkk-platform-browser-adapter";

import { bookHasFiscalPeriods } from "./book-backend";

const LEGACY_DATABASE = { vfsName: "openkk", dbFileName: "openkk.sqlite3" };
const MOVED_MARKER_NAME = "openkk-legacy-book-moved";
const MOVE_LOCK_NAME = "openkk-legacy-book-move";

export const LEGACY_BOOK_NAME = NEW_OPENKK_DOCUMENT_NAME;

export type LegacyBookMarker = {
  isMoved(): Promise<boolean>;
  markMoved(): Promise<void>;
};

export type LegacyBookDependencies = {
  marker: LegacyBookMarker;
  hasLegacyDatabase(): Promise<boolean>;
  exportLegacyDatabase(
    onWaitingForAnotherTab: () => void,
  ): Promise<Uint8Array | null>;
  hasFiscalPeriods(bytes: Uint8Array): Promise<boolean>;
  exclusively<T>(work: () => Promise<T>): Promise<T>;
};

export type LegacyBook = {
  hasBookToMove(): Promise<boolean>;
  moveInto(
    place: BookPlace,
    onWaitingForAnotherTab: () => void,
  ): Promise<string | null>;
};

export function createLegacyBook(
  dependencies: LegacyBookDependencies,
): LegacyBook {
  return {
    async hasBookToMove() {
      if (!(await dependencies.hasLegacyDatabase())) return false;
      return !(await dependencies.marker.isMoved());
    },
    moveInto(place, onWaitingForAnotherTab) {
      return dependencies.exclusively(async () => {
        if (await dependencies.marker.isMoved()) return null;
        const bytes = await dependencies.exportLegacyDatabase(
          onWaitingForAnotherTab,
        );
        if (bytes == null || !(await dependencies.hasFiscalPeriods(bytes))) {
          await dependencies.marker.markMoved();
          return null;
        }
        const book = await place.create(LEGACY_BOOK_NAME);
        try {
          const written = await book.sink.write(bytes);
          if (written !== "written") {
            throw new Error(
              `the legacy book could not be written: ${book.sink.fileName}`,
            );
          }
        } finally {
          book.release();
        }
        await dependencies.marker.markMoved();
        return book.sink.fileName;
      });
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
  hasLegacyDatabase: () => hasFileDbStorage(LEGACY_DATABASE.vfsName),
  exportLegacyDatabase: (onWaitingForAnotherTab) =>
    exportFileDbBytes({ ...LEGACY_DATABASE, onWaitingForAnotherTab }),
  hasFiscalPeriods: bookHasFiscalPeriods,
  exclusively: (work) =>
    typeof navigator === "object" && navigator.locks != null
      ? navigator.locks.request(MOVE_LOCK_NAME, work)
      : work(),
});
