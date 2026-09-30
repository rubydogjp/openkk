"use client";

import { useEffect, useState } from "react";
import {
  BackendApiProvider,
  BrandConfigProvider,
  PlatformAdapterProvider,
  OpenkkAppStateProvider,
  OpenkkAssistProvider,
  OpenkkCalloutsProvider,
  OpenkkConfigProvider,
  OpenkkEntriesProvider,
  OpenkkMaintenanceProvider,
  PrintAdapterProvider,
  WorkInProgressProvider,
  type OpenkkBackendPort,
} from "@rubydogjp/openkk-client";
import { platformBrowserAdapter } from "@rubydogjp/openkk-platform-browser-adapter";
import { printAdapter } from "@rubydogjp/openkk-print-adapter";

import type { OpenkkBundleRuntime } from "./bundle-runtime.js";

const SERVICE_WORKER_URL = "/sw.js";
const BOOT_PHASE_ATTRIBUTE_NAME = "data-openkk-boot";

type OpenkkBootPhase =
  | "starting"
  | "waiting-for-another-tab"
  | "ready"
  | "failed";
const SERVICE_WORKER_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "default";

export function OpenkkAppProviders(props: {
  runtime: OpenkkBundleRuntime;
  children: React.ReactNode;
}) {
  const { runtime } = props;
  const [backendApi, setBackendApi] = useState<OpenkkBackendPort | null>(null);
  const [bootError, setBootError] = useState<unknown>(null);
  const [waitingForAnotherTab, setWaitingForAnotherTab] = useState(false);
  const bootPhase: OpenkkBootPhase =
    bootError != null
      ? "failed"
      : backendApi != null
        ? "ready"
        : waitingForAnotherTab
          ? "waiting-for-another-tab"
          : "starting";

  useEffect(() => {
    document.documentElement.setAttribute(BOOT_PHASE_ATTRIBUTE_NAME, bootPhase);
  }, [bootPhase]);

  useEffect(() => {
    if (backendApi != null) return;

    let cancelled = false;
    void (async () => {
      try {
        const api = await runtime.createBackendApi({
          onWaitingForAnotherTab: () => {
            if (!cancelled) setWaitingForAnotherTab(true);
          },
        });
        if (cancelled) return;
        setWaitingForAnotherTab(false);
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
    platformBrowserAdapter.offlineCache.register(
      SERVICE_WORKER_URL,
      SERVICE_WORKER_BUILD_ID,
    );
  }, [runtime.registerServiceWorker]);

  if (bootError != null) {
    return (
      <div role="alert" style={{ padding: 24, fontSize: 14, color: "#994636" }}>
        ローカルデータベースの初期化に失敗しました。ブラウザを再読込してください。
      </div>
    );
  }

  if (waitingForAnotherTab && backendApi == null) {
    return (
      <div role="status" style={{ padding: 24, fontSize: 14, color: "#6b7280", lineHeight: 1.8 }}>
        このアプリは別のタブで開いています。そのタブを閉じると、ここで自動的に開きます。
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
          <PlatformAdapterProvider adapter={platformBrowserAdapter}>
            <BackendApiProvider api={backendApi}>
              <OpenkkMaintenanceProvider>
                <PrintAdapterProvider adapter={printAdapter}>
                  <OpenkkAppStateProvider
                    seedFiscalPeriod={runtime.seedFiscalPeriod}
                  >
                    <OpenkkEntriesProvider>
                      <OpenkkAssistProvider>
                        <WorkInProgressProvider>
                          {props.children}
                        </WorkInProgressProvider>
                      </OpenkkAssistProvider>
                    </OpenkkEntriesProvider>
                  </OpenkkAppStateProvider>
                </PrintAdapterProvider>
              </OpenkkMaintenanceProvider>
            </BackendApiProvider>
          </PlatformAdapterProvider>
        </OpenkkCalloutsProvider>
      </BrandConfigProvider>
    </OpenkkConfigProvider>
  );
}
