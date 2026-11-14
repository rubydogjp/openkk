import { describe, expect, it } from "vitest";

import {
  createNoticeBoard,
  SUCCESS_NOTICE_LIFETIME_MS,
  type PinnedNotice,
} from "./notice-board.js";

function manualTimers() {
  const pending: Array<{ run: () => void; delayMs: number }> = [];
  return {
    pending,
    timers: {
      start(run: () => void, delayMs: number) {
        const timer = { run, delayMs };
        pending.push(timer);
        return () => {
          const index = pending.indexOf(timer);
          if (index >= 0) pending.splice(index, 1);
        };
      },
    },
    elapse() {
      for (const timer of pending.splice(0)) timer.run();
    },
  };
}

const STORAGE_FAILED: PinnedNotice = {
  tone: "danger",
  message: "ブラウザに保存できませんでした",
  action: null,
  closable: false,
  onClose: null,
};

const SAVE_REMINDER: PinnedNotice = {
  tone: "warning",
  message: "30 日、バックアップしていません",
  action: null,
  closable: true,
  onClose: null,
};

function messages(board: ReturnType<typeof createNoticeBoard>) {
  return board.getState().map((notice) => notice.message);
}

describe("createNoticeBoard", () => {
  it("lets a success result expire and keeps warnings and failures", () => {
    const clock = manualTimers();
    const board = createNoticeBoard(clock.timers);

    board.post({ tone: "success", message: "反映しました" });
    board.post({ tone: "danger", message: "取り込めませんでした" });
    board.post({ tone: "warning", message: "確かめてください" });

    expect(clock.pending.map((timer) => timer.delayMs)).toEqual([
      SUCCESS_NOTICE_LIFETIME_MS,
    ]);
    clock.elapse();
    expect(messages(board)).toEqual([
      "取り込めませんでした",
      "確かめてください",
    ]);
  });

  it("adds the newest notice at the bottom and shows a repeated result once", () => {
    const clock = manualTimers();
    const board = createNoticeBoard(clock.timers);

    board.post({ tone: "success", message: "書き出しました" });
    board.post({ tone: "danger", message: "取り込めませんでした" });
    board.post({ tone: "success", message: "書き出しました" });

    expect(messages(board)).toEqual(["取り込めませんでした", "書き出しました"]);
    expect(clock.pending).toHaveLength(1);
  });

  it("closes a result with its close button", () => {
    const board = createNoticeBoard(manualTimers().timers);
    board.post({ tone: "danger", message: "取り込めませんでした" });
    const [notice] = board.getState();

    expect(notice?.closable).toBe(true);
    board.dismiss(notice!.key);

    expect(board.getState()).toEqual([]);
  });

  it("keeps a notice that waits for a fix until it is unpinned", () => {
    const board = createNoticeBoard(manualTimers().timers);

    board.pin("storage", STORAGE_FAILED);
    board.dismiss("storage");
    expect(messages(board)).toEqual(["ブラウザに保存できませんでした"]);

    board.unpin("storage");
    expect(board.getState()).toEqual([]);
  });

  it("does not bring back a closed reminder until the board is made again", () => {
    const board = createNoticeBoard(manualTimers().timers);

    board.pin("reminder", SAVE_REMINDER);
    board.dismiss("reminder");
    board.pin("reminder", SAVE_REMINDER);

    expect(board.getState()).toEqual([]);
    const reopened = createNoticeBoard(manualTimers().timers);
    reopened.pin("reminder", SAVE_REMINDER);
    expect(messages(reopened)).toEqual(["30 日、バックアップしていません"]);
  });

  it("tells the owner of a pinned notice when the reader closes it, not when it is unpinned", () => {
    const board = createNoticeBoard(manualTimers().timers);
    const closed: string[] = [];
    const introduction: PinnedNotice = {
      tone: "warning",
      message: "データはこのブラウザの中だけにあります",
      action: null,
      closable: true,
      onClose: () => closed.push("introduction"),
    };

    board.pin("introduction", introduction);
    board.unpin("introduction");
    expect(closed).toEqual([]);

    board.pin("introduction", introduction);
    board.dismiss("introduction");
    expect(closed).toEqual(["introduction"]);
    expect(board.getState()).toEqual([]);
  });

  it("updates a pinned notice in place", () => {
    const board = createNoticeBoard(manualTimers().timers);
    board.pin("reminder", SAVE_REMINDER);
    board.post({ tone: "danger", message: "取り込めませんでした" });

    board.pin("reminder", {
      ...SAVE_REMINDER,
      message: "まだバックアップしていません",
    });

    expect(messages(board)).toEqual([
      "まだバックアップしていません",
      "取り込めませんでした",
    ]);
  });

  it("shows three at most, keeping the ones that wait for a fix", () => {
    const board = createNoticeBoard(manualTimers().timers);

    board.pin("storage", STORAGE_FAILED);
    board.post({ tone: "danger", message: "1 つ目" });
    board.post({ tone: "danger", message: "2 つ目" });
    board.post({ tone: "danger", message: "3 つ目" });

    expect(messages(board)).toEqual([
      "ブラウザに保存できませんでした",
      "2 つ目",
      "3 つ目",
    ]);
  });

  it("tells subscribers about every change and hands out a stable list between changes", () => {
    const board = createNoticeBoard(manualTimers().timers);
    let notified = 0;
    const unsubscribe = board.subscribe(() => {
      notified += 1;
    });

    board.post({ tone: "danger", message: "取り込めませんでした" });
    const listed = board.getState();
    board.unpin("missing");

    expect(notified).toBe(1);
    expect(board.getState()).toBe(listed);
    unsubscribe();
    board.dismiss(listed[0]!.key);
    expect(notified).toBe(1);
  });

  it("stops its timers when disposed", () => {
    const clock = manualTimers();
    const board = createNoticeBoard(clock.timers);
    board.post({ tone: "success", message: "反映しました" });

    board.dispose();

    expect(clock.pending).toEqual([]);
    expect(board.getState()).toEqual([]);
  });
});
