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
      "ファイルを優先して、アプリの中の「2026年分」を上書きします。",
    ],
    [
      "replaces_app_changes",
      "アプリの中の「2026年分」に、保存していない変更があります。ファイルを優先して上書きすると失われます。",
    ],
    [
      "changed_both",
      "アプリの中の「2026年分」に、保存していない変更があります。ファイルを優先して上書きすると失われます。",
    ],
    [
      "same_dates",
      "アプリの中の「2026年分」とは別に作られた帳簿です。ファイルを優先して上書きすると、今の帳簿は失われます。",
    ],
  ] as const)("asks before overwriting: %s", (importCase, message) => {
    expect(
      reviewBookImport([item(importCase, "2026年", existing2026)]),
    ).toEqual({ kind: "confirm", messages: [message] });
  });

  it("asks once for each period the file would overwrite", () => {
    expect(
      reviewBookImport([
        item("new", "2027年分", null),
        item("same", "2025年分", { id: "fp-2025", name: "2025年分" }),
        item("replaces_app_changes", "2026年分", existing2026),
        item("changed_outside", "2024年分", {
          id: "fp-2024",
          name: "2024年分",
        }),
      ]),
    ).toEqual({
      kind: "confirm",
      messages: [
        "アプリの中の「2026年分」に、保存していない変更があります。ファイルを優先して上書きすると失われます。",
        "ファイルを優先して、アプリの中の「2024年分」を上書きします。",
      ],
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
