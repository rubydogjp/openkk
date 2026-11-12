"use client";

import type { ReactNode } from "react";
import {
  BrandConfigProvider,
  OpenkkConfigProvider,
  OpenkkRoutingProvider,
  PlatformAdapterProvider,
} from "@rubydogjp/openkk-frontend-ui";
import { type BrandConfig, type OpenkkConfig } from "@rubydogjp/openkk-driver";
import { browserPlatformAdapter } from "@rubydogjp/openkk-browser-platform-adapter";

import { nextRouting } from "./next-routing.js";
import { useOfflineCache } from "./offline-cache.js";

export function OpenkkStartProviders(props: {
  config: OpenkkConfig;
  brandConfig: BrandConfig;
  registerServiceWorker: boolean;
  children: ReactNode;
}) {
  useOfflineCache(props.registerServiceWorker);
  return (
    <OpenkkRoutingProvider routing={nextRouting}>
      <OpenkkConfigProvider config={props.config}>
        <BrandConfigProvider config={props.brandConfig}>
          <PlatformAdapterProvider adapter={browserPlatformAdapter}>
            {props.children}
          </PlatformAdapterProvider>
        </BrandConfigProvider>
      </OpenkkConfigProvider>
    </OpenkkRoutingProvider>
  );
}
