"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BackendApiProvider,
  BrandConfigProvider,
  PlatformAdapterProvider,
  OpenkkAppStateProvider,
  OpenkkAssistProvider,
  OpenkkBookFilesProvider,
  OpenkkCalloutsProvider,
  OpenkkConfigProvider,
  OpenkkEntriesProvider,
  OpenkkMaintenanceProvider,
  PrintAdapterProvider,
  WorkInProgressProvider,
} from "@rubydogjp/openkk-frontend-ui";
import { platformBrowserAdapter } from "@rubydogjp/openkk-browser-platform-adapter";
import { printAdapter } from "@rubydogjp/openkk-browser-print-adapter";

import type {
  OpenkkBundleBackend,
  OpenkkBundleRuntime,
} from "./bundle-runtime.js";
import { useOfflineCache } from "./offline-cache.js";

const BOOT_PHASE_ATTRIBUTE_NAME = "data-openkk-boot";
const BOOK_STORAGE_ATTRIBUTE_NAME = "data-openkk-storage";

type OpenkkBootPhase =
  "starting" | "waiting-for-another-tab" | "ready" | "failed";

export function OpenkkAppProviders(props: {
  runtime: OpenkkBundleRuntime;
  children: ReactNode;
}) {
  const { runtime } = props;
  const [backend, setBackend] = useState<OpenkkBundleBackend | null>(null);
  const backendApi = backend?.api ?? null;
  const bookFiles = backend?.bookFiles ?? null;
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
        const created = await runtime.createBackend({
          onWaitingForAnotherTab: () => {
            if (!cancelled) setWaitingForAnotherTab(true);
          },
        });
        if (cancelled) return;
        setWaitingForAnotherTab(false);
        setBackend(created);
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

  useOfflineCache(runtime.registerServiceWorker);

  useEffect(() => {
    if (bookFiles == null) return;
    const root = document.documentElement;
    const showStatus = () =>
      root.setAttribute(
        BOOK_STORAGE_ATTRIBUTE_NAME,
        bookFiles.getStorageStatus(),
      );
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (bookFiles.getStorageStatus() !== "saved") event.preventDefault();
    };
    showStatus();
    const unsubscribe = bookFiles.subscribe(showStatus);
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      root.removeAttribute(BOOK_STORAGE_ATTRIBUTE_NAME);
    };
  }, [bookFiles]);

  if (bootError != null) {
    return (
      <div role="alert" style={{ padding: 24, fontSize: 14, color: "#994636" }}>
        ローカルデータベースの初期化に失敗しました。ブラウザを再読込してください。
      </div>
    );
  }

  if (waitingForAnotherTab && backendApi == null) {
    return (
      <div
        role="status"
        style={{ padding: 24, fontSize: 14, color: "#6b7280", lineHeight: 1.8 }}
      >
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
            <OpenkkBookFilesProvider bookFiles={bookFiles}>
              <BackendApiProvider api={backendApi}>
                <OpenkkMaintenanceProvider>
                  <PrintAdapterProvider adapter={printAdapter}>
                    <OpenkkAppStateProvider>
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
            </OpenkkBookFilesProvider>
          </PlatformAdapterProvider>
        </OpenkkCalloutsProvider>
      </BrandConfigProvider>
    </OpenkkConfigProvider>
  );
}
