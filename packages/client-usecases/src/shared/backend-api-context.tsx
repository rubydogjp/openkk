"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OpenkkBackendPort } from "@rubydogjp/openkk-client-ports";

const BackendApiContext = createContext<OpenkkBackendPort | null>(null);

export function BackendApiProvider(props: {
  api: OpenkkBackendPort;
  children: ReactNode;
}) {
  return (
    <BackendApiContext.Provider value={props.api}>
      {props.children}
    </BackendApiContext.Provider>
  );
}

export function useBackendApi(): OpenkkBackendPort {
  const value = useContext(BackendApiContext);
  if (value == null) {
    throw new Error(
      "useBackendApi: BackendApiProvider が祖先にありません。app boot 時に inject してください。",
    );
  }
  return value;
}
