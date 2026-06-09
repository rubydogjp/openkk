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
import type { OpenkkBackendPort } from "@rubydogjp/openkk-client";
import { printAdapter } from "@rubydogjp/openkk-print-adapter";

import type { OpenkkBundleRuntime } from "./bundle-runtime";

const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "default";

export function OpenkkAppProviders(props: {
  runtime: OpenkkBundleRuntime;
  children: React.ReactNode;
}) {
  const { runtime } = props;
  const [backendApi, setBackendApi] = useState<OpenkkBackendPort | null>(null);
  const [bootError, setBootError] = useState<unknown>(null);

  useEffect(() => {
    if (backendApi != null) return;

    let cancelled = false;
    void (async () => {
      try {
        const api = await runtime.createBackendApi();
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
  }, [backendApi, runtime]);

  useEffect(() => {
    if (!runtime.registerServiceWorker) return;
    registerServiceWorker();
  }, [runtime.registerServiceWorker]);

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
    <OpenkkConfigProvider config={runtime.config}>
      <BrandConfigProvider config={runtime.brandConfig}>
        <OpenkkCalloutsProvider slots={runtime.calloutSlots}>
          <BackendApiProvider api={backendApi}>
            <PrintAdapterProvider adapter={printAdapter}>
              <OpenkkAppStateProvider seedFiscalPeriod={runtime.seedFiscalPeriod}>
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

function registerServiceWorker(): void {
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
