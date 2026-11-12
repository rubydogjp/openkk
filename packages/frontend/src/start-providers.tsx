"use client";

import type { ReactNode } from "react";
import {
  BrandConfigProvider,
  OpenkkConfigProvider,
  PlatformAdapterProvider,
  type BrandConfig,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";
import { platformBrowserAdapter } from "@rubydogjp/openkk-platform-browser-adapter";

import { useOfflineCache } from "./offline-cache.js";

export function OpenkkStartProviders(props: {
  config: OpenkkConfig;
  brandConfig: BrandConfig;
  registerServiceWorker: boolean;
  children: ReactNode;
}) {
  useOfflineCache(props.registerServiceWorker);
  return (
    <OpenkkConfigProvider config={props.config}>
      <BrandConfigProvider config={props.brandConfig}>
        <PlatformAdapterProvider adapter={platformBrowserAdapter}>
          {props.children}
        </PlatformAdapterProvider>
      </BrandConfigProvider>
    </OpenkkConfigProvider>
  );
}
