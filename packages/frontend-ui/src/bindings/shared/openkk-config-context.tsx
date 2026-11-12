"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  AppError,
  createTodayState,
  type OpenkkConfig,
  type ReadableState,
} from "@rubydogjp/openkk-driver";

import { useReadableState } from "./readable-state.js";

const OpenkkConfigContext = createContext<OpenkkConfig | null>(null);
const OpenkkTodayContext = createContext<ReadableState<Date> | null>(null);

export function OpenkkConfigProvider(props: {
  config: OpenkkConfig;
  children: ReactNode;
}) {
  const today = useMemo(
    () => createTodayState(props.config.clock),
    [props.config.clock],
  );
  useEffect(() => today.start(), [today]);

  return (
    <OpenkkConfigAndTodayProvider config={props.config} today={today}>
      {props.children}
    </OpenkkConfigAndTodayProvider>
  );
}

export function OpenkkConfigAndTodayProvider(props: {
  config: OpenkkConfig;
  today: ReadableState<Date>;
  children: ReactNode;
}) {
  return (
    <OpenkkConfigContext.Provider value={props.config}>
      <OpenkkTodayContext.Provider value={props.today}>
        {props.children}
      </OpenkkTodayContext.Provider>
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
      code: null,
    });
  }
  return value;
}

export function useOpenkkToday(): Date {
  const today = useContext(OpenkkTodayContext);
  if (today == null) {
    throw new AppError({
      messageForDeveloper:
        "useOpenkkToday must be used within OpenkkConfigProvider",
      messageForUser: "アプリの日付を読み込めませんでした",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return useReadableState(today);
}
