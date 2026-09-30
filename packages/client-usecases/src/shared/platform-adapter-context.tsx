"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AppError } from "@rubydogjp/openkk-client-domain";
import type { PlatformPort } from "@rubydogjp/openkk-client-ports";

const PlatformAdapterContext = createContext<PlatformPort | null>(null);

export function PlatformAdapterProvider(props: {
  adapter: PlatformPort;
  children: ReactNode;
}) {
  return (
    <PlatformAdapterContext.Provider value={props.adapter}>
      {props.children}
    </PlatformAdapterContext.Provider>
  );
}

export function usePlatformAdapter(): PlatformPort {
  const value = useContext(PlatformAdapterContext);
  if (value == null) {
    throw new AppError({
      messageForDeveloper:
        "usePlatformAdapter must be used within a PlatformAdapterProvider",
      messageForUser: "アプリの初期化に失敗しました",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return value;
}
