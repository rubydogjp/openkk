"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppError, type OpenkkConfig } from "@rubydogjp/openkk-client-domain";

export type RuntimeOpenkkConfig = OpenkkConfig & { today: Date };

const OpenkkConfigContext = createContext<RuntimeOpenkkConfig | null>(null);

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

  const activeConfig = useMemo(
    () => ({ ...props.config, today }),
    [props.config, today],
  );

  return (
    <OpenkkConfigContext.Provider value={activeConfig}>
      {props.children}
    </OpenkkConfigContext.Provider>
  );
}

export function useOpenkkConfig(): RuntimeOpenkkConfig {
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
