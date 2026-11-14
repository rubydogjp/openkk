import {
  OpenkkBookFileError,
  type OpenkkBookFileProblem,
  type OpenkkBookImportCase,
  type OpenkkBookImportItem,
} from "../../ports/index.js";

export type BookImportReview =
  | { kind: "nothing_to_do"; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "add" }
  | { kind: "confirm"; messages: string[] };

type ReplacingCase = Exclude<
  OpenkkBookImportCase,
  "new" | "same" | "overlapping"
>;

const SAME_MESSAGE = "今のデータと同じです。";

const PROBLEM_MESSAGES: Record<OpenkkBookFileProblem, string> = {
  not_a_book: "このファイルはオープン会計の帳簿ではありません。",
  newer_version:
    "このファイルは新しい版のオープン会計で作られています。アプリを更新してから取り込んでください。",
  no_fiscal_period: "このファイルには取り込める会計期間がありません。",
  books_changed:
    "確かめている間に帳簿が変わりました。もう一度取り込んでください。",
};

function replacingMessage(
  replacingCase: ReplacingCase,
  item: OpenkkBookImportItem,
): string {
  const kept = `アプリの中の「${item.existingFiscalPeriodName ?? item.fiscalPeriodName}」`;
  switch (replacingCase) {
    case "changed_outside":
      return `ファイルを優先して、${kept}を上書きします。`;
    case "replaces_app_changes":
    case "changed_both":
      return `${kept}に、保存していない変更があります。ファイルを優先して上書きすると失われます。`;
    case "same_dates":
      return `${kept}とは別に作られた帳簿です。ファイルを優先して上書きすると、今の帳簿は失われます。`;
  }
}

function isReplacing(
  item: OpenkkBookImportItem,
): item is OpenkkBookImportItem & {
  case: ReplacingCase;
} {
  return (
    item.case !== "new" && item.case !== "same" && item.case !== "overlapping"
  );
}

export function reviewBookImport(
  items: readonly OpenkkBookImportItem[],
): BookImportReview {
  const overlapping = items.find((item) => item.case === "overlapping");
  if (overlapping != null) {
    return {
      kind: "blocked",
      message: `期間が重なる会計期間 (${overlapping.existingFiscalPeriodName ?? ""}) があるため、「${overlapping.fiscalPeriodName}」を取り込めません。`,
    };
  }
  if (items.every((item) => item.case === "same")) {
    return { kind: "nothing_to_do", message: SAME_MESSAGE };
  }
  const replacing = items.filter(isReplacing);
  if (replacing.length === 0) return { kind: "add" };
  return {
    kind: "confirm",
    messages: replacing.map((item) => replacingMessage(item.case, item)),
  };
}

export function bookFileProblemMessage(error: unknown): string | null {
  return error instanceof OpenkkBookFileError
    ? PROBLEM_MESSAGES[error.problem]
    : null;
}
