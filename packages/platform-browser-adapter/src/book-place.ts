import type { BrowserOpenedDocument } from "./documents.js";
import { IN_APP_BOOK_EXTENSION } from "./in-app-book-protocol.js";

export type StoredBook = {
  name: string;
  size: number;
  lastModified: number;
};

export type BookPlace = {
  list(): Promise<StoredBook[]>;
  open(name: string): Promise<BrowserOpenedDocument>;
  create(desiredName: string): Promise<BrowserOpenedDocument>;
  remove(name: string): Promise<void>;
};

export function uniqueBookName(
  desiredName: string,
  takenNames: ReadonlySet<string>,
): string {
  const base = desiredName.endsWith(IN_APP_BOOK_EXTENSION)
    ? desiredName.slice(0, -IN_APP_BOOK_EXTENSION.length)
    : desiredName;
  for (let copy = 1; ; copy += 1) {
    const candidate =
      copy === 1
        ? `${base}${IN_APP_BOOK_EXTENSION}`
        : `${base} (${copy})${IN_APP_BOOK_EXTENSION}`;
    if (!takenNames.has(candidate)) return candidate;
  }
}

export function newestFirst(books: StoredBook[]): StoredBook[] {
  return books.sort((left, right) => right.lastModified - left.lastModified);
}
