"use client";

import type { ReactNode } from "react";
import {
  BrandConfigProvider,
  OpenkkConfigProvider,
  PlatformAdapterProvider,
} from "@rubydogjp/openkk-frontend-ui";
import { type BrandConfig, type OpenkkConfig } from "@rubydogjp/openkk-driver";
import { platformBrowserAdapter } from "@rubydogjp/openkk-browser-platform-adapter";

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
