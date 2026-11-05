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
  canUseInAppBooks,
  createInAppBooks,
  createWorkerBookWriter,
  inAppBooks,
  type InAppBook,
  type InAppBooks,
  type InAppBooksDependencies,
  type InAppBooksDirectory,
  type InAppBookWriter,
} from "./in-app-books.js";
