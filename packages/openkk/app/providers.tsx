"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BackendApiProvider,
  OpenkkAppStateProvider,
  OpenkkAssistProvider,
  OpenkkEntriesProvider,
  BrandConfigProvider,
  OpenkkCalloutsProvider,
  OpenkkConfigProvider,
  PrintAdapterProvider,
  fontWeight,
  palette,
} from "@rubydogjp/openkk-client";
import type { BrandConfig, OpenkkCalloutSlots } from "@rubydogjp/openkk-client";
import type { OpenkkBackendPort } from "@rubydogjp/openkk-client";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createFileDbAdapter } from "@rubydogjp/openkk-file-db-adapter";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";
import { printAdapter } from "@rubydogjp/openkk-print-adapter";

import { buildOpenkkDemoSeed } from "./demo-seed";
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
  const [backendApi, setBackendApi] = useState<OpenkkBackendPort | null>(
    null,
  );
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
      <div style={{ padding: 24, fontSize: 14, color: "#6b7280" }}>
        起動中…
      </div>
    );
  }

  return (
    <OpenkkConfigProvider config={openkkConfig}>
      <BrandConfigProvider config={openkkBrandConfig}>
        <OpenkkCalloutsProvider slots={openkkCalloutSlots}>
          <BackendApiProvider api={backendApi}>
            <PrintAdapterProvider adapter={printAdapter}>
              <OpenkkAppStateProvider>
                <OpenkkEntriesProvider>
                  <OpenkkAssistProvider>
                    {props.children}
                  </OpenkkAssistProvider>
                </OpenkkEntriesProvider>
              </OpenkkAppStateProvider>
            </PrintAdapterProvider>
          </BackendApiProvider>
        </OpenkkCalloutsProvider>
      </BrandConfigProvider>
    </OpenkkConfigProvider>
  );
}

const openkkBrandConfig: BrandConfig = {
  marketingSiteUrl: "https://rubydog.jp/openkk",
  productSiteUrl: "https://rubydog.jp/openkk",
  editionLabel:
    openkkConfig.mode === "demo"
      ? "デモ版"
      : openkkConfig.mode === "dev"
        ? "Dev版"
        : "(無印版)",
};

const openkkCalloutSlots: OpenkkCalloutSlots = {
  stepNextFiscalPeriodDemoFooter: (
    <>
      <div>デモ版を使っていただきありがとうございました!</div>
      <div>
        正式リリースは
        <Link
          href="https://x.com/rubydogjp"
          target="_blank"
          rel="noreferrer"
          style={{
            color: palette.brand,
            fontWeight: fontWeight.bold,
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          }}
        >
          X公式アカウント
        </Link>
        でアナウンス予定です
      </div>
      <div>
        レビュー・要望・バグ報告も同じアカウントまでお願いしますm(_ _)m
      </div>
    </>
  ),
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
  const seed = openkkConfig.isDemoMode
    ? buildOpenkkDemoSeed(openkkConfig)
    : undefined;
  const db = await createMemoryDbAdapter(seed);
  const server = createOpenkkEmbeddedBackend(db, {
    userId: openkkConfig.mockUserId,
  });
  return createOpenkkEmbeddedBackendAdapter(server);
}
