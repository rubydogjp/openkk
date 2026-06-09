"use client";

import type { BrandConfig, OpenkkBackendPort } from "@rubydogjp/openkk-client";
import {
  OpenkkAppProviders,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-frontend";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createFileDbAdapter } from "@rubydogjp/openkk-file-db-adapter";

import { openkkConfig } from "./openkk-config";

const brandConfig: BrandConfig = {};

const runtime: OpenkkBundleRuntime = {
  config: openkkConfig,
  brandConfig,
  calloutSlots: {},
  createBackendApi: createFileBackendApi,
  registerServiceWorker: true,
};

export function Providers(props: { children: React.ReactNode }) {
  return (
    <OpenkkAppProviders runtime={runtime}>{props.children}</OpenkkAppProviders>
  );
}

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
