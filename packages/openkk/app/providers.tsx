"use client";

import { useEffect, useState } from "react";
import {
  BackendApiProvider,
  OpenkkAppStateProvider,
  OpenkkAssistProvider,
  OpenkkEntriesProvider,
  BrandConfigProvider,
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

import { buildOpenkkDemoSeed } from "./demo-seed";
import { openkkConfig } from "./openkk-config";

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
        setBootError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendApi]);

  if (bootError != null) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "#994636" }}>
        ローカルデータベースの初期化に失敗しました。ブラウザを再読込してください。
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
      </BrandConfigProvider>
    </OpenkkConfigProvider>
  );
}

const openkkBrandConfig: BrandConfig = {
  editionLabel:
    openkkConfig.mode === "demo"
      ? "デモ版"
      : openkkConfig.mode === "dev"
        ? "Dev版"
        : "(無印版)",
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
