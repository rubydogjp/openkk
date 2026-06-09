"use client";

import type { BrandConfig, OpenkkBackendPort } from "@rubydogjp/openkk-client";
import {
  OpenkkAppProviders,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-frontend";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import { openkkConfig } from "./openkk-config";

const brandConfig: BrandConfig = {};

const runtime: OpenkkBundleRuntime = {
  config: openkkConfig,
  brandConfig,
  calloutSlots: {},
  createBackendApi: createMemoryBackendApi,
  registerServiceWorker: false,
};

export function Providers(props: { children: React.ReactNode }) {
  return (
    <OpenkkAppProviders runtime={runtime}>{props.children}</OpenkkAppProviders>
  );
}

async function createMemoryBackendApi(): Promise<OpenkkBackendPort> {
  const db = await createMemoryDbAdapter();
  const server = createOpenkkEmbeddedBackend(db, {
    userId: openkkConfig.mockUserId,
  });
  return createOpenkkEmbeddedBackendAdapter(server);
}
