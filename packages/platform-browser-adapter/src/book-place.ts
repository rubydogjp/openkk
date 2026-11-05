import {
  OPENKK_DOCUMENT_EXTENSION,
  type BrowserOpenedDocument,
} from "./documents.js";

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

export type BookFileDirectory = {
  values(): AsyncIterable<{ kind: string; name: string }>;
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{ getFile(): Promise<File> }>;
};

export function isBookFileName(name: string): boolean {
  return name.endsWith(OPENKK_DOCUMENT_EXTENSION);
}

export function uniqueBookName(
  desiredName: string,
  books: readonly StoredBook[],
): string {
  const taken = new Set(books.map((book) => book.name));
  const base = isBookFileName(desiredName)
    ? desiredName.slice(0, -OPENKK_DOCUMENT_EXTENSION.length)
    : desiredName;
  for (let copy = 1; ; copy += 1) {
    const candidate =
      copy === 1
        ? `${base}${OPENKK_DOCUMENT_EXTENSION}`
        : `${base} (${copy})${OPENKK_DOCUMENT_EXTENSION}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function listBooks(
  directory: BookFileDirectory,
): Promise<StoredBook[]> {
  const books: StoredBook[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind !== "file" || !isBookFileName(entry.name)) continue;
    const file = await (
      await directory.getFileHandle(entry.name, { create: false })
    ).getFile();
    books.push({
      name: entry.name,
      size: file.size,
      lastModified: file.lastModified,
    });
  }
  return books.sort((left, right) => right.lastModified - left.lastModified);
}
