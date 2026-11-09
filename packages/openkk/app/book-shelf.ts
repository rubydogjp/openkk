import type {
  DocumentStartBook,
  DocumentStartPlace,
  OpenkkOtherBookPeriod,
} from "@rubydogjp/openkk-client";
import {
  browserDocuments,
  canUseFolderBooks,
  canUseInAppBooks,
  folderBooks,
  inAppBooks,
  type BookPlace,
  type BrowserOpenedDocument,
} from "@rubydogjp/openkk-platform-browser-adapter";

import { readBookPeriods } from "./book-backend";
import { LAST_BOOK_STORAGE_KEY } from "./openkk-config";

export type BookShelfKind = "folder" | "in_app" | "download";

export type BookShelfState = {
  kind: BookShelfKind;
  place: DocumentStartPlace;
  books: DocumentStartBook[];
};

export function detectBookShelfKind(): BookShelfKind {
  if (canUseFolderBooks()) return "folder";
  if (canUseInAppBooks()) return "in_app";
  return "download";
}

export function emptyBookShelf(kind: BookShelfKind): BookShelfState {
  switch (kind) {
    case "folder":
      return { kind, place: { kind: "no_folder" }, books: [] };
    case "in_app":
      return { kind, place: { kind: "in_app" }, books: [] };
    case "download":
      return { kind, place: { kind: "download" }, books: [] };
  }
}

export function canReachBooks(place: DocumentStartPlace): boolean {
  return place.kind === "folder" || place.kind === "in_app";
}

export async function loadBookShelf(
  kind: BookShelfKind,
): Promise<BookShelfState> {
  switch (kind) {
    case "folder": {
      const [folderName, permission] = await Promise.all([
        folderBooks.folderName(),
        folderBooks.permission(),
      ]);
      if (folderName == null) return emptyBookShelf(kind);
      if (permission !== "granted") {
        return {
          kind,
          place: { kind: "folder_needs_access", folderName },
          books: [],
        };
      }
      return {
        kind,
        place: { kind: "folder", folderName },
        books: await folderBooks.list(),
      };
    }
    case "in_app":
      try {
        return { ...emptyBookShelf(kind), books: await inAppBooks.list() };
      } catch (error) {
        console.warn("[openkk] books cannot be kept in this browser:", error);
        return emptyBookShelf("download");
      }
    case "download":
      return emptyBookShelf(kind);
  }
}

export function bookPlace(kind: BookShelfKind): BookPlace | null {
  switch (kind) {
    case "folder":
      return folderBooks;
    case "in_app":
      return inAppBooks;
    case "download":
      return null;
  }
}

export async function createShelfBook(
  kind: BookShelfKind,
  desiredName: string,
): Promise<BrowserOpenedDocument> {
  const place = bookPlace(kind);
  return place == null
    ? browserDocuments.createForDownload(desiredName)
    : place.create(desiredName);
}

export async function openShelfBook(
  kind: BookShelfKind,
  name: string,
): Promise<BrowserOpenedDocument> {
  const place = bookPlace(kind);
  if (place == null) throw new Error("books are not kept in this browser");
  return place.open(name);
}

export async function removeShelfBook(
  kind: BookShelfKind,
  name: string,
): Promise<void> {
  await bookPlace(kind)?.remove(name);
}

export async function readOtherBookPeriods(
  kind: BookShelfKind,
  currentName: string,
): Promise<OpenkkOtherBookPeriod[]> {
  const place = bookPlace(kind);
  if (place == null) return [];
  const others = (await place.list()).filter(
    (book) => book.name !== currentName,
  );
  const periods = await Promise.all(
    others.map(async (book) => {
      try {
        return await readBookPeriods(book.name, await place.read(book.name));
      } catch (error) {
        console.warn(`[openkk] ${book.name} could not be read:`, error);
        return [];
      }
    }),
  );
  return periods.flat();
}

export async function copyOutsideFileIntoApp(): Promise<BrowserOpenedDocument | null> {
  const picked = await browserDocuments.open();
  if (picked == null) return null;
  const copy = await inAppBooks.create(picked.sink.fileName);
  return { ...copy, bytes: picked.bytes };
}

type LastBook = { kind: BookShelfKind; name: string };

function isLastBook(value: unknown): value is LastBook {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

export function readLastBook(kind: BookShelfKind): string | null {
  try {
    const stored = localStorage.getItem(LAST_BOOK_STORAGE_KEY);
    if (stored == null) return null;
    const parsed: unknown = JSON.parse(stored);
    return isLastBook(parsed) && parsed.kind === kind ? parsed.name : null;
  } catch {
    return null;
  }
}

export function rememberLastBook(kind: BookShelfKind, name: string): void {
  try {
    const lastBook: LastBook = { kind, name };
    localStorage.setItem(LAST_BOOK_STORAGE_KEY, JSON.stringify(lastBook));
  } catch (error) {
    console.warn("[openkk] the last book cannot be remembered:", error);
  }
}

export function forgetLastBook(): void {
  try {
    localStorage.removeItem(LAST_BOOK_STORAGE_KEY);
  } catch (error) {
    console.warn("[openkk] the last book cannot be forgotten:", error);
  }
}
