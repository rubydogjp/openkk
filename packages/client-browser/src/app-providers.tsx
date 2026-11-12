"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createOpenkkDriver } from "@rubydogjp/openkk-driver";
import {
  BrandConfigProvider,
  OpenkkCalloutsProvider,
  OpenkkDriverProvider,
  OpenkkRoutingProvider,
  WorkInProgressProvider,
} from "@rubydogjp/openkk-frontend-ui";
import { browserPlatformAdapter } from "@rubydogjp/openkk-browser-platform-adapter";
import { browserPrintAdapter } from "@rubydogjp/openkk-browser-print-adapter";

import type {
  OpenkkBundlePorts,
  OpenkkBundleRuntime,
} from "./bundle-runtime.js";
import { nextRouting } from "./next-routing.js";
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
  const [ports, setPorts] = useState<OpenkkBundlePorts | null>(null);
  const bookFiles = ports?.bookFiles ?? null;
  const driver = useMemo(
    () =>
      ports == null
        ? null
        : createOpenkkDriver(runtime.config, {
            backend: ports.backend,
            platform: browserPlatformAdapter,
            print: browserPrintAdapter,
            bookFiles: ports.bookFiles,
          }),
    [ports, runtime.config],
  );
  const [bootError, setBootError] = useState<unknown>(null);
  const [waitingForAnotherTab, setWaitingForAnotherTab] = useState(false);
  const bootPhase: OpenkkBootPhase =
    bootError != null
      ? "failed"
      : ports != null
        ? "ready"
        : waitingForAnotherTab
          ? "waiting-for-another-tab"
          : "starting";

  useEffect(() => {
    document.documentElement.setAttribute(BOOT_PHASE_ATTRIBUTE_NAME, bootPhase);
  }, [bootPhase]);

  useEffect(() => {
    if (ports != null) return;

    let cancelled = false;
    void (async () => {
      try {
        const created = await runtime.createPorts({
          onWaitingForAnotherTab: () => {
            if (!cancelled) setWaitingForAnotherTab(true);
          },
        });
        if (cancelled) return;
        setWaitingForAnotherTab(false);
        setPorts(created);
      } catch (error) {
        if (cancelled) return;
        console.error("[openkk] backend init failed:", error);
        setBootError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ports, runtime]);

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

  if (waitingForAnotherTab && driver == null) {
    return (
      <div
        role="status"
        style={{ padding: 24, fontSize: 14, color: "#6b7280", lineHeight: 1.8 }}
      >
        このアプリは別のタブで開いています。そのタブを閉じると、ここで自動的に開きます。
      </div>
    );
  }

  if (driver == null) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "#6b7280" }}>起動中…</div>
    );
  }

  return (
    <OpenkkRoutingProvider routing={nextRouting}>
      <BrandConfigProvider config={runtime.brandConfig}>
        <OpenkkCalloutsProvider slots={runtime.calloutSlots}>
          <OpenkkDriverProvider driver={driver}>
            <WorkInProgressProvider>{props.children}</WorkInProgressProvider>
          </OpenkkDriverProvider>
        </OpenkkCalloutsProvider>
      </BrandConfigProvider>
    </OpenkkRoutingProvider>
  );
}
