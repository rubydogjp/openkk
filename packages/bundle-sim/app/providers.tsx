"use client";

import type { ReactNode } from "react";

import type { BrandConfig } from "@rubydogjp/openkk-driver";
import {
  OpenkkAppProviders,
  type OpenkkBundlePorts,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-client-browser";
import { createOpenkkBackendApi } from "@rubydogjp/openkk-backend-api";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
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
  createPorts: createMemoryPorts,
  registerServiceWorker: false,
};

export function Providers(props: { children: ReactNode }) {
  return (
    <OpenkkAppProviders runtime={runtime}>{props.children}</OpenkkAppProviders>
  );
}

async function createMemoryPorts(): Promise<OpenkkBundlePorts> {
  const db = await createMemoryDbAdapter(null);
  const backendApi = createOpenkkBackendApi(db, {
    userId: openkkConfig.embeddedUser.id,
  });
  return {
    backend: createOpenkkEmbeddedBackendAdapter(backendApi),
    bookFiles: null,
  };
}
