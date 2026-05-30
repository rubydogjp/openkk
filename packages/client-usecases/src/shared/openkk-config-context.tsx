"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OpenkkConfig } from "@rubydogjp/openkk-client-domain";

const OpenkkConfigContext = createContext<OpenkkConfig | null>(null);

export function OpenkkConfigProvider(props: {
  config: OpenkkConfig;
  children: ReactNode;
}) {
  return (
    <OpenkkConfigContext.Provider value={props.config}>
      {props.children}
    </OpenkkConfigContext.Provider>
  );
}

export function useOpenkkConfig(): OpenkkConfig {
  const value = useContext(OpenkkConfigContext);
  if (value == null) {
    throw new Error(
      "useOpenkkConfig must be used within OpenkkConfigProvider",
    );
  }
  return value;
}
