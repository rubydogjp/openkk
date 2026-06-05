"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AppError, type OpenkkConfig } from "@rubydogjp/openkk-client-domain";

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
    throw new AppError({
      messageForDeveloper:
        "useOpenkkConfig must be used within OpenkkConfigProvider",
      messageForUser: "アプリの設定を読み込めませんでした",
      originalMessage: null,
      statusCode: null,
    });
  }
  return value;
}
