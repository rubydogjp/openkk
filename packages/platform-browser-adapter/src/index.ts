import type { PlatformPort } from "@rubydogjp/openkk-client-ports";

import { browserAppInstall } from "./app-install.js";
import { browserClipboard } from "./clipboard.js";
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
  clipboard: browserClipboard,
};
