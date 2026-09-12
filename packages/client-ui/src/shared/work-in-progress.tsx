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

type EndWork = () => void;

type WorkInProgressValue = {
  busy: boolean;
  beginWork: () => EndWork;
};

const WorkInProgressContext = createContext<WorkInProgressValue | null>(null);

const BUSY_ATTRIBUTE_NAME = "data-openkk-busy";

export function WorkInProgressProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const beginWork = useCallback(() => {
    setCount((current) => current + 1);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      setCount((current) => Math.max(0, current - 1));
    };
  }, []);

  const busy = count > 0;

  useEffect(() => {
    document.documentElement.setAttribute(BUSY_ATTRIBUTE_NAME, busy ? "1" : "0");
    return () => {
      document.documentElement.removeAttribute(BUSY_ATTRIBUTE_NAME);
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
    return { busy: false, beginWork: () => () => {} };
  }
  return value;
}

export function useReportWorkInProgress(busy: boolean): void {
  const { beginWork } = useWorkInProgress();

  useEffect(() => {
    if (!busy) return;
    return beginWork();
  }, [busy, beginWork]);
}
