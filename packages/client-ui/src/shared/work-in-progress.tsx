"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 「いま処理が動いているか」をアプリ全体で 1 つに集める。
 */
type WorkInProgressValue = {
  busy: boolean;
  /** 処理の開始を申告する。戻り値を呼ぶと終了を申告したことになる。 */
  beginWork: () => () => void;
};

const WorkInProgressContext = createContext<WorkInProgressValue | null>(null);

export const busyAttributeName = "data-openkk-busy";

export function WorkInProgressProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const beginWork = useCallback(() => {
    setCount((current) => current + 1);
    let ended = false;
    return () => {
      // 二重に終了を申告しても数がずれないようにする
      if (ended) return;
      ended = true;
      setCount((current) => Math.max(0, current - 1));
    };
  }, []);

  const busy = count > 0;

  useEffect(() => {
    // 画面の外 (テストや自動操作) からも見えるように印を出す
    document.documentElement.setAttribute(busyAttributeName, busy ? "1" : "0");
    return () => {
      document.documentElement.removeAttribute(busyAttributeName);
    };
  }, [busy]);

  const value = useMemo<WorkInProgressValue>(
    () => ({ busy, beginWork }),
    [busy, beginWork],
  );

  return (
    <WorkInProgressContext.Provider value={value}>
      {children}
    </WorkInProgressContext.Provider>
  );
}

export function useWorkInProgress(): WorkInProgressValue {
  const value = useContext(WorkInProgressContext);
  if (value == null) {
    // Provider の外でも画面は動くべきなので、何もしない実装を返す
    return { busy: false, beginWork: () => () => undefined };
  }
  return value;
}

/**
 * `busy` の真偽をそのまま申告する。
 *
 * 既に `onBusyChange` のような真偽で持っている画面から使う。
 */
export function useReportWorkInProgress(busy: boolean): void {
  const { beginWork } = useWorkInProgress();

  useEffect(() => {
    if (!busy) return;
    return beginWork();
  }, [busy, beginWork]);
}
