import type { PlatformPort } from "@rubydogjp/openkk-driver";

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
  AppLockUnavailableError,
  browserAppLock,
  createAppLock,
  type AppLock,
  type AppLockManager,
} from "./app-lock.js";
export {
  deliverBookFile,
  type BookFileDeliveryResult,
} from "./book-file-delivery.js";
export {
  bookFileName,
  isBookFileName,
  OPENKK_BOOK_EXTENSION,
  OPENKK_BOOK_MIME_TYPE,
} from "./book-file-format.js";
export {
  canUseInAppBooks,
  createInAppBookStore,
  createWorkerBookWriter,
  inAppBookStore,
  newInAppBookName,
  requestBrowserPersistentStorage,
  type InAppBookDirectory,
  type InAppBookStore,
  type InAppBookStoreDependencies,
  type InAppBookWriter,
} from "./in-app-book-store.js";
