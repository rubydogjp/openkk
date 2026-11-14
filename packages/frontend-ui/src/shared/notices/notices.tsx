"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createNoticeBoard,
  type NoticeBoard,
  type NoticeResult,
  type NoticeTimers,
  type NoticeTone,
} from "./notice-board.js";
import { NoticeLayer } from "./notice-layer.js";

const NoticeBoardContext = createContext<NoticeBoard | null>(null);

const BROWSER_TIMERS: NoticeTimers = {
  start(run, delayMs) {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
};

export function OpenkkNoticesProvider(props: { children: ReactNode }) {
  const [board] = useState(() => createNoticeBoard(BROWSER_TIMERS));
  return (
    <NoticeBoardContext.Provider value={board}>
      {props.children}
      <NoticeLayer board={board} />
    </NoticeBoardContext.Provider>
  );
}

function useNoticeBoard(): NoticeBoard {
  const board = useContext(NoticeBoardContext);
  if (board == null) {
    throw new Error("OpenkkNoticesProvider is missing above this component");
  }
  return board;
}

export type OpenkkNotices = {
  show(result: NoticeResult): void;
};

export function useOpenkkNotices(): OpenkkNotices {
  const board = useNoticeBoard();
  return useMemo(() => ({ show: (result) => board.post(result) }), [board]);
}

export type OpenkkStandingNotice = {
  tone: NoticeTone;
  message: string;
  action: { label: string; run: () => void } | null;
  closable: boolean;
};

export function useOpenkkStandingNotice(
  key: string,
  notice: OpenkkStandingNotice | null,
): void {
  const board = useNoticeBoard();
  const runAction = useRef<(() => void) | null>(null);
  runAction.current = notice?.action?.run ?? null;
  const tone = notice?.tone ?? null;
  const message = notice?.message ?? null;
  const actionLabel = notice?.action?.label ?? null;
  const closable = notice?.closable ?? false;

  useEffect(() => {
    if (tone == null || message == null) return;
    board.pin(key, {
      tone,
      message,
      closable,
      action:
        actionLabel == null
          ? null
          : { label: actionLabel, run: () => runAction.current?.() },
    });
    return () => board.unpin(key);
  }, [board, key, tone, message, actionLabel, closable]);
}
