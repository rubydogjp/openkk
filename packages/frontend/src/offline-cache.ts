import { useEffect } from "react";
import { platformBrowserAdapter } from "@rubydogjp/openkk-platform-browser-adapter";

const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "default";

export function useOfflineCache(registerServiceWorker: boolean): void {
  useEffect(() => {
    if (!registerServiceWorker) return;
    platformBrowserAdapter.offlineCache.register(
      SERVICE_WORKER_URL,
      SERVICE_WORKER_BUILD_ID,
    );
  }, [registerServiceWorker]);
}
