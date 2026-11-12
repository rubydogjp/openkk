"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AppError, type OpenkkBackendPort } from "@rubydogjp/openkk-driver";

const BackendContext = createContext<OpenkkBackendPort | null>(null);

export function BackendProvider(props: {
  backend: OpenkkBackendPort;
  children: ReactNode;
}) {
  return (
    <BackendContext.Provider value={props.backend}>
      {props.children}
    </BackendContext.Provider>
  );
}

export function useBackend(): OpenkkBackendPort {
  const value = useContext(BackendContext);
  if (value == null) {
    throw new AppError({
      messageForDeveloper: "useBackend must be used within BackendProvider",
      messageForUser: "アプリの初期化に失敗しました",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return value;
}
