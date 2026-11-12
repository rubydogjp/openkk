import { describe, expect, it } from "vitest";

import {
  OpenkkBookFileError,
  type OpenkkBookImportCase,
  type OpenkkBookImportItem,
} from "../../ports/index.js";

import {
  bookFileProblemMessage,
  reviewBookImport,
} from "./book-import-review.js";

function item(
  importCase: OpenkkBookImportCase,
  name: string,
  existing: { id: string; name: string } | null,
): OpenkkBookImportItem {
  return {
    fiscalPeriodId: `file-${name}`,
    fiscalPeriodName: name,
    case: importCase,
    existingFiscalPeriodId: existing?.id ?? null,
    existingFiscalPeriodName: existing?.name ?? null,
  };
}

const existing2026 = { id: "fp-2026", name: "2026年分" };

describe("reviewBookImport", () => {
  it("adds new periods without asking", () => {
    expect(reviewBookImport([item("new", "2027年分", null)])).toEqual({
      kind: "add",
    });
  });

  it("does nothing when every period is the same as the app holds", () => {
    expect(reviewBookImport([item("same", "2026年分", existing2026)])).toEqual({
      kind: "nothing_to_do",
      message: "今のデータと同じです。",
    });
  });

  it.each([
    [
      "changed_outside",
      "アプリの外で変更がありました。取り込むと、アプリの中の帳簿をこのファイルの内容に置き換えます。",
    ],
    ["replaces_app_changes", "保存したあとにアプリで変えた内容は失われます。"],
    [
      "changed_both",
      "アプリの外で変更がありました。アプリの中にも保存していない変更があります。取り込むと、アプリの中の変更は失われます。",
    ],
    [
      "same_dates",
      "別に作られた同じ期間 (2026年分) の帳簿です。取り込むと、今の帳簿はすべて置き換わります。",
    ],
  ] as const)("asks before replacing: %s", (importCase, message) => {
    expect(
      reviewBookImport([item(importCase, "2026年", existing2026)]),
    ).toEqual({
      kind: "confirm",
      messages: [message],
      replacedFiscalPeriodIds: ["fp-2026"],
    });
  });

  it("names each period when the file holds several", () => {
    expect(
      reviewBookImport([
        item("new", "2027年分", null),
        item("same", "2025年分", { id: "fp-2025", name: "2025年分" }),
        item("replaces_app_changes", "2026年分", existing2026),
      ]),
    ).toEqual({
      kind: "confirm",
      messages: ["2026年分: 保存したあとにアプリで変えた内容は失われます。"],
      replacedFiscalPeriodIds: ["fp-2026"],
    });
  });

  it("blocks the whole file when one period overlaps another book", () => {
    expect(
      reviewBookImport([
        item("new", "2028年分", null),
        item("overlapping", "2026年度", existing2026),
      ]),
    ).toEqual({
      kind: "blocked",
      message:
        "期間が重なる会計期間 (2026年分) があるため、「2026年度」を取り込めません。",
    });
  });
});

describe("bookFileProblemMessage", () => {
  it("explains each problem and leaves other errors alone", () => {
    expect(bookFileProblemMessage(new OpenkkBookFileError("not_a_book"))).toBe(
      "このファイルはオープン会計の帳簿ではありません。",
    );
    expect(
      bookFileProblemMessage(new OpenkkBookFileError("newer_version")),
    ).toContain("アプリを更新してから");
    expect(
      bookFileProblemMessage(new OpenkkBookFileError("no_fiscal_period")),
    ).toContain("取り込める会計期間がありません");
    expect(
      bookFileProblemMessage(new OpenkkBookFileError("books_changed")),
    ).toContain("もう一度取り込んでください");
    expect(bookFileProblemMessage(new Error("other"))).toBeNull();
  });
});
