import type { PlatformOfflineCache } from "@rubydogjp/openkk-client-ports";

export const browserOfflineCache: PlatformOfflineCache = {
  register(scriptUrl, version) {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const versionedUrl = `${scriptUrl}?v=${encodeURIComponent(version)}`;
    void navigator.serviceWorker.register(versionedUrl).catch((error) => {
      console.error("[openkk] service worker registration failed:", error);
    });
  },
};
