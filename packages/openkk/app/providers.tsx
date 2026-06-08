"use client";

import { useEffect, useState } from "react";
import {
  BackendApiProvider,
  OpenkkAppStateProvider,
  OpenkkAssistProvider,
  OpenkkEntriesProvider,
  BrandConfigProvider,
  OpenkkCalloutsProvider,
  OpenkkConfigProvider,
  PrintAdapterProvider,
} from "@rubydogjp/openkk-client";
import type { BrandConfig } from "@rubydogjp/openkk-client";
import type { OpenkkBackendPort } from "@rubydogjp/openkk-client";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createFileDbAdapter } from "@rubydogjp/openkk-file-db-adapter";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";
import { printAdapter } from "@rubydogjp/openkk-print-adapter";

import { openkkConfig } from "./openkk-config";

const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "default";

function registerServiceWorker(): void {
  if (!openkkConfig.isProdMode) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const versionedUrl = `${SERVICE_WORKER_URL}?v=${encodeURIComponent(
    SERVICE_WORKER_BUILD_ID,
  )}`;
  void navigator.serviceWorker.register(versionedUrl).catch((error) => {
    console.error("[openkk] service worker registration failed:", error);
  });
}

export function Providers(props: { children: React.ReactNode }) {
  const [backendApi, setBackendApi] = useState<OpenkkBackendPort | null>(null);
  const [bootError, setBootError] = useState<unknown>(null);

  useEffect(() => {
    if (backendApi != null) return;

    let cancelled = false;
    void (async () => {
      try {
        const api = openkkConfig.isProdMode
          ? await createFileBackendApi()
          : await createMemoryBackendApi();
        if (cancelled) return;
        setBackendApi(api);
      } catch (error) {
        if (cancelled) return;
        console.error("[openkk] backend init failed:", error);
        setBootError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendApi]);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  if (bootError != null) {
    const isAnotherTab =
      bootError instanceof Error && bootError.message === "ANOTHER_TAB";
    return (
      <div style={{ padding: 24, fontSize: 14, color: "#994636" }}>
        {isAnotherTab
          ? "このアプリは複数のタブで同時に開けません。他のタブを閉じてから、このページを再読込してください。"
          : "ローカルデータベースの初期化に失敗しました。ブラウザを再読込してください。"}
      </div>
    );
  }

  if (backendApi == null) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "#6b7280" }}>起動中…</div>
    );
  }

  return (
    <OpenkkConfigProvider config={openkkConfig}>
      <BrandConfigProvider config={brandConfig}>
        <OpenkkCalloutsProvider slots={{}}>
          <BackendApiProvider api={backendApi}>
            <PrintAdapterProvider adapter={printAdapter}>
              <OpenkkAppStateProvider>
                <OpenkkEntriesProvider>
                  <OpenkkAssistProvider>{props.children}</OpenkkAssistProvider>
                </OpenkkEntriesProvider>
              </OpenkkAppStateProvider>
            </PrintAdapterProvider>
          </BackendApiProvider>
        </OpenkkCalloutsProvider>
      </BrandConfigProvider>
    </OpenkkConfigProvider>
  );
}

const brandConfig: BrandConfig = {
  editionLabel: openkkConfig.mode === "dev" ? "Dev版" : "(無印版)",
};

async function createFileBackendApi(): Promise<OpenkkBackendPort> {
  const db = await createFileDbAdapter({
    vfsName: "openkk",
    dbFileName: "openkk.sqlite3",
  });
  const server = createOpenkkEmbeddedBackend(db, {
    userId: openkkConfig.mockUserId,
  });
  return createOpenkkEmbeddedBackendAdapter(server);
}

async function createMemoryBackendApi(): Promise<OpenkkBackendPort> {
  const db = await createMemoryDbAdapter();
  const server = createOpenkkEmbeddedBackend(db, {
    userId: openkkConfig.mockUserId,
  });
  return createOpenkkEmbeddedBackendAdapter(server);
}
