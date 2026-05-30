"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PrintPort } from "@rubydogjp/openkk-client-ports";

const PrintAdapterContext = createContext<PrintPort | null>(null);

export function PrintAdapterProvider(props: {
  adapter: PrintPort;
  children: ReactNode;
}) {
  return (
    <PrintAdapterContext.Provider value={props.adapter}>
      {props.children}
    </PrintAdapterContext.Provider>
  );
}

export function usePrintAdapter(): PrintPort {
  const value = useContext(PrintAdapterContext);
  if (value == null) {
    throw new Error(
      "usePrintAdapter must be used within a PrintAdapterProvider",
    );
  }
  return value;
}
