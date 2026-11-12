"use client";

import type { ReactNode } from "react";

import type { BrandConfig } from "@rubydogjp/openkk-driver";
import {
  OpenkkAppProviders,
  type OpenkkBundleBackend,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-client-browser";
import {
  createOpenkkEmbeddedBackend,
  createOpenkkEmbeddedBackendAdapter,
} from "@rubydogjp/openkk-embedded-backend-adapter";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import { openkkConfig } from "./openkk-config";

const brandConfig: BrandConfig = {
  marketingSiteUrl: null,
  productSiteUrl: null,
  accountIconUrl: null,
};

const runtime: OpenkkBundleRuntime = {
  config: openkkConfig,
  brandConfig,
  calloutSlots: {
    stepJournalizingPreClosingHint: null,
    stepNextFiscalPeriodFooter: null,
  },
  createBackend: createMemoryBackend,
  registerServiceWorker: false,
};

export function Providers(props: { children: ReactNode }) {
  return (
    <OpenkkAppProviders runtime={runtime}>{props.children}</OpenkkAppProviders>
  );
}

async function createMemoryBackend(): Promise<OpenkkBundleBackend> {
  const db = await createMemoryDbAdapter(null);
  const server = createOpenkkEmbeddedBackend(db, {
    userId: openkkConfig.embeddedUser.id,
  });
  return { api: createOpenkkEmbeddedBackendAdapter(server), bookFiles: null };
}
