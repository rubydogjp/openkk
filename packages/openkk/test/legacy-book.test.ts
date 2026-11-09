import { describe, expect, it, vi } from "vitest";
import { createDocumentDbAdapter } from "@rubydogjp/openkk-document-db-adapter";
import type {
  BookPlace,
  BrowserOpenedDocument,
} from "@rubydogjp/openkk-platform-browser-adapter";

import { bookHasFiscalPeriods, createBookBackend } from "../app/book-backend";
import {
  createLegacyBook,
  LEGACY_BOOK_NAME,
  type LegacyBookDependencies,
} from "../app/legacy-book";

const LEGACY_BYTES = new Uint8Array([1, 2, 3]);

function fakePlace(writeResult: "written" | "conflict") {
  const written: { name: string; bytes: Uint8Array }[] = [];
  const released: string[] = [];
  const place: BookPlace = {
    list: async () => [],
    open: async () => {
      throw new Error("not used");
    },
    read: async () => {
      throw new Error("not used");
    },
    async create(desiredName): Promise<BrowserOpenedDocument> {
      const fileName = desiredName.replace(".openkk", " (2).openkk");
      return {
        bytes: null,
        sink: {
          fileName,
          saveMode: "auto",
          async write(bytes) {
            if (writeResult === "written")
              written.push({ name: fileName, bytes });
            return writeResult;
          },
        },
        backup: null,
        remember: async () => {},
        release: () => {
          released.push(fileName);
        },
      };
    },
    remove: async () => {},
  };
  return { place, written, released };
}

function fakeDependencies(overrides: Partial<LegacyBookDependencies>) {
  let moved = false;
  const dependencies: LegacyBookDependencies = {
    marker: {
      isMoved: async () => moved,
      markMoved: async () => {
        moved = true;
      },
    },
    hasLegacyDatabase: async () => true,
    exportLegacyDatabase: vi.fn(async () => LEGACY_BYTES),
    hasFiscalPeriods: async () => true,
    exclusively: (work) => work(),
    ...overrides,
  };
  return { dependencies, isMoved: () => moved };
}

describe("legacy book", () => {
  it("copies the old database into a new book and moves it only once", async () => {
    const { dependencies, isMoved } = fakeDependencies({});
    const legacyBook = createLegacyBook(dependencies);
    const { place, written, released } = fakePlace("written");

    await expect(legacyBook.hasBookToMove()).resolves.toBe(true);
    await expect(legacyBook.moveInto(place, () => {})).resolves.toBe(
      "帳簿 (2).openkk",
    );
    expect(written).toEqual([{ name: "帳簿 (2).openkk", bytes: LEGACY_BYTES }]);
    expect(released).toEqual(["帳簿 (2).openkk"]);
    expect(isMoved()).toBe(true);
    await expect(legacyBook.hasBookToMove()).resolves.toBe(false);

    await expect(legacyBook.moveInto(place, () => {})).resolves.toBeNull();
    expect(written).toHaveLength(1);
    expect(dependencies.exportLegacyDatabase).toHaveBeenCalledOnce();
  });

  it("names the moved book like a new book", () => {
    expect(LEGACY_BOOK_NAME).toBe("帳簿.openkk");
  });

  it("makes no book when there is no old database or it has no fiscal period", async () => {
    for (const overrides of [
      { exportLegacyDatabase: async () => null },
      { hasFiscalPeriods: async () => false },
    ]) {
      const { dependencies, isMoved } = fakeDependencies(overrides);
      const { place, written } = fakePlace("written");

      await expect(
        createLegacyBook(dependencies).moveInto(place, () => {}),
      ).resolves.toBeNull();
      expect(written).toEqual([]);
      expect(isMoved()).toBe(true);
    }
  });

  it("has nothing to move without the old database, whatever the marker says", async () => {
    const isMoved = vi.fn(async () => false);
    const { dependencies } = fakeDependencies({
      hasLegacyDatabase: async () => false,
    });
    const legacyBook = createLegacyBook({
      ...dependencies,
      marker: { isMoved, markMoved: async () => {} },
    });

    await expect(legacyBook.hasBookToMove()).resolves.toBe(false);
    expect(isMoved).not.toHaveBeenCalled();
  });

  it("keeps the old database to move again when the copy cannot be written", async () => {
    const { dependencies, isMoved } = fakeDependencies({});
    const { place, released } = fakePlace("conflict");

    await expect(
      createLegacyBook(dependencies).moveInto(place, () => {}),
    ).rejects.toThrow("the legacy book could not be written");
    expect(released).toEqual(["帳簿 (2).openkk"]);
    expect(isMoved()).toBe(false);
  });

  it("keeps the old database to move again when it cannot be read", async () => {
    const { dependencies, isMoved } = fakeDependencies({
      exportLegacyDatabase: async () => {
        throw new Error("database disk image is malformed");
      },
    });
    const { place } = fakePlace("written");

    await expect(
      createLegacyBook(dependencies).moveInto(place, () => {}),
    ).rejects.toThrow("database disk image is malformed");
    expect(isMoved()).toBe(false);
  });

  it("tells when another tab still holds the old database", async () => {
    const onWaitingForAnotherTab = vi.fn();
    const { dependencies } = fakeDependencies({
      exportLegacyDatabase: async (onWaiting) => {
        onWaiting();
        return LEGACY_BYTES;
      },
    });
    const { place } = fakePlace("written");

    await createLegacyBook(dependencies).moveInto(
      place,
      onWaitingForAnotherTab,
    );
    expect(onWaitingForAnotherTab).toHaveBeenCalledOnce();
  });

  it("checks inside the lock so two tabs do not both move the old database", async () => {
    let queue = Promise.resolve();
    const { dependencies } = fakeDependencies({
      exclusively: <T>(work: () => Promise<T>) => {
        const run = queue.then(work);
        queue = run.then(
          () => {},
          () => {},
        );
        return run;
      },
    });
    const legacyBook = createLegacyBook(dependencies);
    const { place, written } = fakePlace("written");

    const results = await Promise.all([
      legacyBook.moveInto(place, () => {}),
      legacyBook.moveInto(place, () => {}),
    ]);
    expect(results).toEqual(["帳簿 (2).openkk", null]);
    expect(written).toHaveLength(1);
  });
});

describe("bookHasFiscalPeriods", () => {
  it("tells a book with a fiscal period from an empty one", async () => {
    const empty = await createDocumentDbAdapter(null);
    const emptyBytes = empty.exportBytes();
    const withPeriod = await createDocumentDbAdapter(null);
    await createBookBackend(withPeriod.db).fiscalPeriods.create({
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const withPeriodBytes = withPeriod.exportBytes();
    empty.close();
    withPeriod.close();

    await expect(bookHasFiscalPeriods(emptyBytes)).resolves.toBe(false);
    await expect(bookHasFiscalPeriods(withPeriodBytes)).resolves.toBe(true);
  });
});
