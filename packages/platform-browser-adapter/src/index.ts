import type { PlatformPort } from "@rubydogjp/openkk-client-ports";

import { browserAppInstall } from "./app-install.js";
import { browserFiles } from "./files.js";
import { browserNavigation } from "./navigation.js";
import { browserOfflineCache } from "./offline-cache.js";
import { browserStorage } from "./storage.js";

export const platformBrowserAdapter: PlatformPort = {
  appInstall: browserAppInstall,
  offlineCache: browserOfflineCache,
  storage: browserStorage,
  files: browserFiles,
  navigation: browserNavigation,
};

export {
  BrowserDocumentPermissionError,
  browserDocuments,
  createDownloadDocumentSink,
  createHandleDocumentSink,
  NEW_OPENKK_DOCUMENT_NAME,
  OPENKK_DOCUMENT_EXTENSION,
  OPENKK_DOCUMENT_MIME_TYPE,
  type BrowserDocumentFileHandle,
  type BrowserOpenedDocument,
  type BrowserRecentDocument,
} from "./documents.js";
export {
  bookBackups,
  createBookBackups,
  type BookBackups,
  type BookBackupsDependencies,
} from "./book-backup.js";
export {
  type BookFileDirectory,
  type BookPlace,
  type StoredBook,
} from "./book-place.js";
export {
  BookFolderMissingError,
  canUseFolderBooks,
  createFolderBooks,
  folderBooks,
  type BookFolderHandle,
  type FolderBooks,
  type FolderBooksDependencies,
  type FolderPermission,
} from "./folder-books.js";
export {
  canUseInAppBooks,
  createInAppBooks,
  createWorkerBookWriter,
  inAppBooks,
  type InAppBooksDependencies,
  type InAppBookWriter,
} from "./in-app-books.js";
