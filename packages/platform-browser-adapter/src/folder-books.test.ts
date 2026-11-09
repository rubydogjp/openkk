import { describe, expect, it } from "vitest";

import {
  fakeLockManager,
  settleLocks,
} from "../test-support/fake-lock-manager.js";
import { BookInUseError, createBookLocks } from "./book-lock.js";
import { BrowserDocumentPermissionError } from "./documents.js";
import {
  BookFolderMissingError,
  createFolderBooks,
  type BookFolderHandle,
} from "./folder-books.js";

type StoredFile = { bytes: Uint8Array; lastModified: number };

function fakeFolder(name: string, permission: PermissionState) {
  const files = new Map<string, StoredFile>();
  let clock = 5_000;
  let state = permission;
  const touch = (fileName: string, bytes: Uint8Array) => {
    clock += 1;
    files.set(fileName, { bytes: bytes.slice(), lastModified: clock });
  };
  const fileHandle = (fileName: string) => ({
    name: fileName,
    async getFile() {
      const stored = files.get(fileName);
      if (stored == null) {
        throw new DOMException(`missing ${fileName}`, "NotFoundError");
      }
      return new File([stored.bytes.slice()], fileName, {
        lastModified: stored.lastModified,
      });
    },
    async createWritable() {
      let written = new Uint8Array();
      return {
        async write(data: BufferSource) {
          written = new Uint8Array(
            data instanceof ArrayBuffer ? data : (data as Uint8Array).slice(),
          );
        },
        async close() {
          touch(fileName, written);
        },
      };
    },
  });
  const folder: BookFolderHandle = {
    name,
    async *values() {
      for (const fileName of files.keys())
        yield { kind: "file", name: fileName };
      yield { kind: "directory", name: "受け取った書類" };
    },
    async getFileHandle(fileName, options) {
      if (!files.has(fileName)) {
        if (!options.create) {
          throw new DOMException(`missing ${fileName}`, "NotFoundError");
        }
        touch(fileName, new Uint8Array());
      }
      return fileHandle(fileName);
    },
    async removeEntry(fileName) {
      files.delete(fileName);
    },
    async queryPermission() {
      return state;
    },
    async requestPermission() {
      state = "granted";
      return state;
    },
  };
  return { folder, files, touch };
}

function folderBooksWith(initial: BookFolderHandle | null) {
  let remembered = initial;
  const picks: Array<BookFolderHandle | null> = [];
  const books = createFolderBooks({
    pickFolder: async () => picks.shift() ?? null,
    loadFolder: async () => remembered,
    saveFolder: async (folder) => {
      remembered = folder;
    },
    locks: createBookLocks(fakeLockManager()),
  });
  return { books, picks, remembered: () => remembered };
}

describe("folder books", () => {
  it("remembers the folder chosen once and lists its books, newest first", async () => {
    const { folder, touch } = fakeFolder("帳簿", "granted");
    touch("2025年分.openkk", new Uint8Array([1]));
    touch("2026年分.openkk", new Uint8Array([1, 2]));
    touch("領収書.pdf", new Uint8Array([3]));
    const { books, picks, remembered } = folderBooksWith(null);
    picks.push(folder);

    const chosen = await books.chooseFolder();
    const listed = await books.list();

    expect(chosen).toBe("帳簿");
    expect(remembered()).toBe(folder);
    expect(await books.folderName()).toBe("帳簿");
    expect(listed.map((book) => [book.name, book.size])).toEqual([
      ["2026年分.openkk", 2],
      ["2025年分.openkk", 1],
    ]);
  });

  it("keeps the previous folder when choosing is cancelled", async () => {
    const { folder } = fakeFolder("帳簿", "granted");
    const { books } = folderBooksWith(folder);

    expect(await books.chooseFolder()).toBeNull();
    expect(await books.folderName()).toBe("帳簿");
  });

  it("creates the book file only on its first save", async () => {
    const { folder, files } = fakeFolder("帳簿", "granted");
    const { books } = folderBooksWith(folder);

    const created = await books.create("2026年分");
    const beforeSave = [...files.keys()];
    const result = await created.sink.write(new Uint8Array([7, 8]));
    created.release();
    await settleLocks();
    const reopened = await books.open("2026年分.openkk");

    expect(created.sink.fileName).toBe("2026年分.openkk");
    expect(beforeSave).toEqual([]);
    expect(result).toBe("written");
    expect(reopened.bytes).toEqual(new Uint8Array([7, 8]));
  });

  it("reads a book that another tab has open without taking it", async () => {
    const { folder, touch } = fakeFolder("帳簿", "granted");
    touch("2026年分.openkk", new Uint8Array([4, 2]));
    const { books } = folderBooksWith(folder);

    const opened = await books.open("2026年分.openkk");
    await expect(books.read("2026年分.openkk")).resolves.toEqual(
      new Uint8Array([4, 2]),
    );
    opened.release();
  });

  it("refuses a book that another tab has open until that tab lets it go", async () => {
    const { folder, files, touch } = fakeFolder("帳簿", "granted");
    touch("2026年分.openkk", new Uint8Array([1]));
    const { books } = folderBooksWith(folder);

    const opened = await books.open("2026年分.openkk");
    await expect(books.open("2026年分.openkk")).rejects.toThrow(BookInUseError);
    await expect(books.remove("2026年分.openkk")).rejects.toThrow(
      BookInUseError,
    );
    expect(files.has("2026年分.openkk")).toBe(true);

    opened.release();
    await settleLocks();
    await expect(books.open("2026年分.openkk")).resolves.toMatchObject({
      bytes: new Uint8Array([1]),
    });
  });

  it("picks a free name and reports a conflict if the name was taken before the first save", async () => {
    const { folder, touch } = fakeFolder("帳簿", "granted");
    touch("2026年分.openkk", new Uint8Array([1]));
    const { books } = folderBooksWith(folder);

    const created = await books.create("2026年分");
    touch("2026年分 (2).openkk", new Uint8Array([9]));

    expect(created.sink.fileName).toBe("2026年分 (2).openkk");
    expect(await created.sink.write(new Uint8Array([2]))).toBe("conflict");
  });

  it("reports a conflict when the file changed after it was opened", async () => {
    const { folder, touch } = fakeFolder("帳簿", "granted");
    touch("2026年分.openkk", new Uint8Array([1]));
    const { books } = folderBooksWith(folder);

    const opened = await books.open("2026年分.openkk");
    touch("2026年分.openkk", new Uint8Array([2]));

    expect(await opened.sink.write(new Uint8Array([3]))).toBe("conflict");
  });

  it("asks for access again when the browser forgot the permission", async () => {
    const { folder, touch } = fakeFolder("帳簿", "prompt");
    touch("2026年分.openkk", new Uint8Array([1]));
    const { books } = folderBooksWith(folder);

    expect(await books.permission()).toBe("prompt");
    await expect(books.list()).rejects.toBeInstanceOf(
      BrowserDocumentPermissionError,
    );
    expect(await books.requestAccess()).toBe("granted");
    expect((await books.list()).map((book) => book.name)).toEqual([
      "2026年分.openkk",
    ]);
  });

  it("needs a folder to be chosen first, and can forget it", async () => {
    const { folder } = fakeFolder("帳簿", "granted");
    const empty = folderBooksWith(null);
    const chosen = folderBooksWith(folder);

    await expect(empty.books.list()).rejects.toBeInstanceOf(
      BookFolderMissingError,
    );
    expect(await empty.books.permission()).toBeNull();
    await chosen.books.forgetFolder();
    expect(await chosen.books.folderName()).toBeNull();
  });

  it("removes a book from the folder", async () => {
    const { folder, touch, files } = fakeFolder("帳簿", "granted");
    touch("2026年分.openkk", new Uint8Array([1]));
    const { books } = folderBooksWith(folder);

    await books.remove("2026年分.openkk");

    expect(files.size).toBe(0);
  });
});
