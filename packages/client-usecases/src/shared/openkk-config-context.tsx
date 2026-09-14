"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppError, type OpenkkConfig } from "@rubydogjp/openkk-client-domain";

const OpenkkConfigContext = createContext<OpenkkConfig | null>(null);
const OpenkkTodayContext = createContext<Date | null>(null);

export function OpenkkConfigProvider(props: {
  config: OpenkkConfig;
  children: ReactNode;
}) {
  const [today, setToday] = useState(() => props.config.clock.today());

  useEffect(() => {
    setToday(props.config.clock.today());
    if (props.config.clock.kind === "fixed") return;

    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextDayUpdate = () => {
      const current = props.config.clock.today();
      const nextDate = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 1,
      );
      const delay = Math.max(1_000, nextDate.getTime() - current.getTime() + 50);
      timer = setTimeout(() => {
        setToday(props.config.clock.today());
        scheduleNextDayUpdate();
      }, delay);
    };
    scheduleNextDayUpdate();
    return () => clearTimeout(timer);
  }, [props.config.clock]);

  return (
    <OpenkkConfigContext.Provider value={props.config}>
      <OpenkkTodayContext.Provider value={today}>
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
  const value = useContext(OpenkkTodayContext);
  if (value == null) {
    throw new AppError({
      messageForDeveloper:
        "useOpenkkToday must be used within OpenkkConfigProvider",
      messageForUser: "アプリの日付を読み込めませんでした",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return value;
}
