import {
  OpenkkBookFileError,
  type OpenkkBookFileProblem,
  type OpenkkBookImportCase,
  type OpenkkBookImportItem,
} from "@rubydogjp/openkk-driver";

export type BookImportReview =
  | { kind: "nothing_to_do"; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "add" }
  | {
      kind: "confirm";
      messages: string[];
      replacedFiscalPeriodIds: string[];
    };

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
  switch (replacingCase) {
    case "changed_outside":
      return "アプリの外で変更がありました。取り込むと、アプリの中の帳簿をこのファイルの内容に置き換えます。";
    case "replaces_app_changes":
      return "保存したあとにアプリで変えた内容は失われます。";
    case "changed_both":
      return "アプリの外で変更がありました。アプリの中にも保存していない変更があります。取り込むと、アプリの中の変更は失われます。";
    case "same_dates":
      return `別に作られた同じ期間 (${item.existingFiscalPeriodName ?? item.fiscalPeriodName}) の帳簿です。取り込むと、今の帳簿はすべて置き換わります。`;
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
      message: `期間が重なる帳簿 (${overlapping.existingFiscalPeriodName ?? ""}) があるため、「${overlapping.fiscalPeriodName}」を取り込めません。`,
    };
  }
  if (items.every((item) => item.case === "same")) {
    return { kind: "nothing_to_do", message: SAME_MESSAGE };
  }
  const replacing = items.filter(isReplacing);
  if (replacing.length === 0) return { kind: "add" };
  const named = items.length > 1;
  return {
    kind: "confirm",
    messages: replacing.map((item) => {
      const message = replacingMessage(item.case, item);
      return named ? `${item.fiscalPeriodName}: ${message}` : message;
    }),
    replacedFiscalPeriodIds: replacing.flatMap((item) =>
      item.existingFiscalPeriodId == null ? [] : [item.existingFiscalPeriodId],
    ),
  };
}

export function bookFileProblemMessage(error: unknown): string | null {
  return error instanceof OpenkkBookFileError
    ? PROBLEM_MESSAGES[error.problem]
    : null;
}
