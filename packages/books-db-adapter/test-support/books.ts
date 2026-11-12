import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { DbSnapshot } from "@rubydogjp/openkk-engine";

import { createNodeSqliteDbAdapter } from "../../disk-db-adapter/src/index.js";
import {
  createBooksDbAdapter,
  createMemoryBookStore,
  splitBookFile,
  type BooksDbAdapter,
  type BookStore,
} from "../src/index.js";

export type TestBooks = {
  adapter: BooksDbAdapter;
  store: BookStore;
  removedFiscalPeriodIds: string[];
  saveErrors: unknown[];
};

const tempDirs: string[] = [];
const openAdapters: BooksDbAdapter[] = [];
let nextBookNumber = 1;

export function closeTestBooks(): void {
  for (const adapter of openAdapters.splice(0)) adapter.close();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function tempBookPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-books-"));
  tempDirs.push(dir);
  return path.join(dir, "book.openkk");
}

export async function seededBookBytes(seed: DbSnapshot): Promise<Uint8Array> {
  const filePath = tempBookPath();
  (await createNodeSqliteDbAdapter(filePath, seed)).close();
  return new Uint8Array(fs.readFileSync(filePath));
}

export async function openTestBooks(store: BookStore): Promise<TestBooks> {
  const removedFiscalPeriodIds: string[] = [];
  const saveErrors: unknown[] = [];
  const adapter = await createBooksDbAdapter({
    store,
    newBookName: () => `book-${nextBookNumber++}.openkk`,
    onFiscalPeriodRemoved: (id) => removedFiscalPeriodIds.push(id),
    onSaveError: (error) => saveErrors.push(error),
  });
  openAdapters.push(adapter);
  return { adapter, store, removedFiscalPeriodIds, saveErrors };
}

export async function seededStore(seed: DbSnapshot): Promise<BookStore> {
  const books = new Map<string, Uint8Array>();
  for (const period of await splitBookFile(await seededBookBytes(seed))) {
    books.set(`seed-${books.size + 1}.openkk`, period.bytes);
  }
  return createMemoryBookStore(books);
}

export function emptyStore(): BookStore {
  return createMemoryBookStore(new Map());
}
