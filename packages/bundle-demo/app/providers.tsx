"use client";

import type { ReactNode } from "react";

import {
  OpenkkAppProviders,
  type OpenkkBundleBackend,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-client-browser";
import { createOpenkkBackendApi } from "@rubydogjp/openkk-backend-api";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import { openkkConfig } from "./openkk-config";
import { demoBrandConfig, demoCalloutSlots } from "../demo/demo-bundle";
import { buildOpenkkDemoSeed } from "../demo/demo-seed";

const runtime: OpenkkBundleRuntime = {
  config: openkkConfig,
  brandConfig: demoBrandConfig,
  calloutSlots: demoCalloutSlots,
  createBackend: createDemoBackend,
  registerServiceWorker: false,
};

export function Providers(props: { children: ReactNode }) {
  return (
    <OpenkkAppProviders runtime={runtime}>{props.children}</OpenkkAppProviders>
  );
}

async function createDemoBackend(): Promise<OpenkkBundleBackend> {
  const db = await createMemoryDbAdapter(buildOpenkkDemoSeed(openkkConfig));
  const backendApi = createOpenkkBackendApi(db, {
    userId: openkkConfig.embeddedUser.id,
  });
  return {
    api: createOpenkkEmbeddedBackendAdapter(backendApi),
    bookFiles: null,
  };
}
