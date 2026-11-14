import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createNoticeBoard } from "./notice-board.js";
import { NoticeStack } from "./notice-layer.js";

const NO_TIMERS = { start: () => () => {} };

function render(board: ReturnType<typeof createNoticeBoard>): string {
  return renderToStaticMarkup(
    <NoticeStack notices={board.getState()} onDismiss={() => {}} />,
  );
}

function cardsOf(board: ReturnType<typeof createNoticeBoard>): string[] {
  return render(board).split('<div role="').slice(1);
}

describe("NoticeStack", () => {
  it("renders nothing but the empty layer when there is no notice", () => {
    const board = createNoticeBoard(NO_TIMERS);

    expect(render(board)).toBe('<div class="bk-notice-layer"></div>');
  });

  it("announces failures as alerts and the rest as status, oldest first", () => {
    const board = createNoticeBoard(NO_TIMERS);
    board.post({ tone: "danger", message: "取り込めませんでした" });
    board.post({ tone: "success", message: "反映しました" });

    const cards = cardsOf(board);

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatch(/^alert" data-notice-tone="danger"/);
    expect(cards[0]).toContain("取り込めませんでした");
    expect(cards[1]).toMatch(/^status" data-notice-tone="success"/);
    expect(cards[1]).toContain("反映しました");
  });

  it("gives a close button only to a notice that may be closed", () => {
    const board = createNoticeBoard(NO_TIMERS);
    board.pin("storage", {
      tone: "danger",
      message: "ブラウザに保存できませんでした",
      action: { label: "もう一度", run: () => {} },
      closable: false,
      onClose: null,
    });
    board.pin("reminder", {
      tone: "warning",
      message: "30 日、ファイルに保存していません",
      action: { label: "保存", run: () => {} },
      closable: true,
      onClose: null,
    });

    const [storage, reminder] = cardsOf(board);

    expect(storage).toContain(">もう一度</button>");
    expect(storage).not.toContain('aria-label="閉じる"');
    expect(reminder).toContain(">保存</button>");
    expect(reminder).toContain('aria-label="閉じる"');
  });
});
