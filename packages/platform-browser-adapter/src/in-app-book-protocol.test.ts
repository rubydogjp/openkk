import { describe, expect, it } from "vitest";

import {
  PENDING_COPY_SUFFIX,
  READY_MARK_SUFFIX,
  recoverBook,
  removeBook,
  writeBook,
  type BookDirectory,
} from "./in-app-book-protocol.js";

const BOOK = "2026年分.openkk";
const OLD_BYTES = new Uint8Array([1, 1, 1, 1]);
const NEW_BYTES = new Uint8Array([2, 2, 2, 2, 2, 2]);

function memoryDirectory(crashOnceWhileWriting: string | null) {
  const files = new Map<string, Uint8Array>();
  let crashTarget = crashOnceWhileWriting;
  const directory: BookDirectory = {
    async read(name) {
      return files.get(name) ?? null;
    },
    async write(name, bytes) {
      if (name === crashTarget) {
        crashTarget = null;
        files.set(name, bytes.slice(0, 1));
        throw new Error(`stopped while writing ${name}`);
      }
      files.set(name, bytes.slice());
    },
    async remove(name) {
      files.delete(name);
    },
  };
  return { files, directory };
}

describe("in-app book saving", () => {
  it("writes the book and leaves no recovery files behind", async () => {
    const { files, directory } = memoryDirectory(null);

    await writeBook(directory, BOOK, NEW_BYTES);

    expect([...files.keys()]).toEqual([BOOK]);
    expect(files.get(BOOK)).toEqual(NEW_BYTES);
  });

  it("keeps the previous book when the save stopped before the copy was finished", async () => {
    const { files, directory } = memoryDirectory(
      `${BOOK}${PENDING_COPY_SUFFIX}`,
    );
    files.set(BOOK, OLD_BYTES);

    await expect(writeBook(directory, BOOK, NEW_BYTES)).rejects.toThrow();
    await recoverBook(directory, BOOK);

    expect([...files.keys()]).toEqual([BOOK]);
    expect(files.get(BOOK)).toEqual(OLD_BYTES);
  });

  it("restores the new book when the save stopped while writing the book itself", async () => {
    const { files, directory } = memoryDirectory(BOOK);
    files.set(BOOK, OLD_BYTES);

    await expect(writeBook(directory, BOOK, NEW_BYTES)).rejects.toThrow();
    expect(files.get(BOOK)).not.toEqual(NEW_BYTES);
    await recoverBook(directory, BOOK);

    expect([...files.keys()]).toEqual([BOOK]);
    expect(files.get(BOOK)).toEqual(NEW_BYTES);
  });

  it("leaves a cleanly saved book as it is", async () => {
    const { files, directory } = memoryDirectory(null);
    files.set(BOOK, OLD_BYTES);

    await recoverBook(directory, BOOK);

    expect([...files.keys()]).toEqual([BOOK]);
    expect(files.get(BOOK)).toEqual(OLD_BYTES);
  });

  it("removes the book together with its recovery files", async () => {
    const { files, directory } = memoryDirectory(null);
    files.set(BOOK, OLD_BYTES);
    files.set(`${BOOK}${PENDING_COPY_SUFFIX}`, NEW_BYTES);
    files.set(`${BOOK}${READY_MARK_SUFFIX}`, new Uint8Array(0));

    await removeBook(directory, BOOK);

    expect(files.size).toBe(0);
  });
});
