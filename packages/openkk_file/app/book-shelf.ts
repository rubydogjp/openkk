import type {
  DocumentStartBook,
  DocumentStartPlace,
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

function bookPlace(kind: BookShelfKind): BookPlace | null {
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

export async function copyOutsideFileIntoApp(): Promise<BrowserOpenedDocument | null> {
  const picked = await browserDocuments.open();
  if (picked == null) return null;
  const copy = await inAppBooks.create(picked.sink.fileName);
  return { ...copy, bytes: picked.bytes };
}
