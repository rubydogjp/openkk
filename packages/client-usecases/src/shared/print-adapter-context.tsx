"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AppError } from "@rubydogjp/openkk-client-domain";
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
    throw new AppError({
      messageForDeveloper:
        "usePrintAdapter must be used within a PrintAdapterProvider",
      messageForUser: "印刷機能の初期化に失敗しました",
      originalMessage: null,
      statusCode: null,
    });
  }
  return value;
}
