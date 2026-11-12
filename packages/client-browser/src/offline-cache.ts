import { useEffect } from "react";
import { browserPlatformAdapter } from "@rubydogjp/openkk-browser-platform-adapter";

const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "default";

export function useOfflineCache(registerServiceWorker: boolean): void {
  useEffect(() => {
    if (!registerServiceWorker) return;
    browserPlatformAdapter.offlineCache.register(
      SERVICE_WORKER_URL,
      SERVICE_WORKER_BUILD_ID,
    );
  }, [registerServiceWorker]);
}
