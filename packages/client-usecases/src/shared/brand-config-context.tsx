"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BrandConfig } from "@rubydogjp/openkk-client-domain";

const BrandConfigContext = createContext<BrandConfig>({});

export function BrandConfigProvider(props: {
  config: BrandConfig;
  children: ReactNode;
}) {
  return (
    <BrandConfigContext.Provider value={props.config}>
      {props.children}
    </BrandConfigContext.Provider>
  );
}

export function useBrandConfig(): BrandConfig {
  return useContext(BrandConfigContext);
}
