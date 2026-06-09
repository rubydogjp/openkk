"use client";

import type { OpenkkBackendPort } from "@rubydogjp/openkk-client";
import {
  OpenkkAppProviders,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-frontend";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import { openkkConfig } from "./openkk-config";
import { demoBrandConfig, demoCalloutSlots, demoSeedFiscalPeriod } from "../demo/demo-bundle";
import { buildOpenkkDemoSeed } from "../demo/demo-seed";

const runtime: OpenkkBundleRuntime = {
  config: openkkConfig,
  brandConfig: demoBrandConfig,
  calloutSlots: demoCalloutSlots,
  seedFiscalPeriod: demoSeedFiscalPeriod,
  createBackendApi: createDemoBackendApi,
  registerServiceWorker: false,
};

export function Providers(props: { children: React.ReactNode }) {
  return (
    <OpenkkAppProviders runtime={runtime}>{props.children}</OpenkkAppProviders>
  );
}

async function createDemoBackendApi(): Promise<OpenkkBackendPort> {
  const db = await createMemoryDbAdapter(buildOpenkkDemoSeed(openkkConfig));
  const server = createOpenkkEmbeddedBackend(db, {
    userId: openkkConfig.mockUserId,
  });
  return createOpenkkEmbeddedBackendAdapter(server);
}
