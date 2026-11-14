export type NoticeTone = "success" | "warning" | "danger";

export type NoticeAction = { label: string; run: () => void };

export type Notice = {
  key: string;
  tone: NoticeTone;
  message: string;
  action: NoticeAction | null;
  closable: boolean;
};

export type NoticeResult = { tone: NoticeTone; message: string };

export type PinnedNotice = {
  tone: NoticeTone;
  message: string;
  action: NoticeAction | null;
  closable: boolean;
};

export type NoticeTimers = {
  start(run: () => void, delayMs: number): () => void;
};

export type NoticeBoard = {
  getState(): ReadonlyArray<Notice>;
  subscribe(listener: () => void): () => void;
  post(result: NoticeResult): void;
  pin(key: string, notice: PinnedNotice): void;
  unpin(key: string): void;
  dismiss(key: string): void;
  dispose(): void;
};

export const SUCCESS_NOTICE_LIFETIME_MS = 5000;
export const MAX_VISIBLE_NOTICES = 3;

type BoardEntry = {
  notice: Notice;
  postedOrder: number;
  pinned: boolean;
  cancelExpiry: (() => void) | null;
};

function staysUntilResolved(entry: BoardEntry): boolean {
  return entry.pinned && !entry.notice.closable;
}

function visibleNotices(entries: ReadonlyArray<BoardEntry>): Notice[] {
  const newestFirst = [...entries].sort(
    (left, right) => right.postedOrder - left.postedOrder,
  );
  return [
    ...newestFirst.filter(staysUntilResolved),
    ...newestFirst.filter((entry) => !staysUntilResolved(entry)),
  ]
    .slice(0, MAX_VISIBLE_NOTICES)
    .sort((left, right) => left.postedOrder - right.postedOrder)
    .map((entry) => entry.notice);
}

export function createNoticeBoard(timers: NoticeTimers): NoticeBoard {
  const listeners = new Set<() => void>();
  const dismissedPinKeys = new Set<string>();
  let entries: BoardEntry[] = [];
  let visible: ReadonlyArray<Notice> = [];
  let sequence = 0;

  const publish = (next: BoardEntry[]) => {
    entries = next;
    visible = visibleNotices(entries);
    for (const listener of listeners) listener();
  };

  const without = (key: string): BoardEntry[] => {
    for (const entry of entries) {
      if (entry.notice.key === key) entry.cancelExpiry?.();
    }
    return entries.filter((entry) => entry.notice.key !== key);
  };

  const remove = (key: string) => {
    if (entries.some((entry) => entry.notice.key === key)) {
      publish(without(key));
    }
  };

  return {
    getState: () => visible,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    post(result) {
      const repeated = entries.find(
        (entry) =>
          !entry.pinned &&
          entry.notice.tone === result.tone &&
          entry.notice.message === result.message,
      );
      const kept = repeated == null ? entries : without(repeated.notice.key);
      sequence += 1;
      const key = `result-${sequence}`;
      publish([
        ...kept,
        {
          notice: { ...result, key, action: null, closable: true },
          postedOrder: sequence,
          pinned: false,
          cancelExpiry:
            result.tone === "success"
              ? timers.start(() => remove(key), SUCCESS_NOTICE_LIFETIME_MS)
              : null,
        },
      ]);
    },
    pin(key, notice) {
      if (dismissedPinKeys.has(key)) return;
      const current = entries.find((entry) => entry.notice.key === key);
      if (current != null) {
        publish(
          entries.map((entry) =>
            entry === current
              ? { ...entry, notice: { ...notice, key } }
              : entry,
          ),
        );
        return;
      }
      sequence += 1;
      publish([
        ...entries,
        {
          notice: { ...notice, key },
          postedOrder: sequence,
          pinned: true,
          cancelExpiry: null,
        },
      ]);
    },
    unpin: remove,
    dismiss(key) {
      const target = entries.find((entry) => entry.notice.key === key);
      if (target == null || !target.notice.closable) return;
      if (target.pinned) dismissedPinKeys.add(key);
      remove(key);
    },
    dispose() {
      for (const entry of entries) entry.cancelExpiry?.();
      entries = [];
      visible = [];
    },
  };
}
