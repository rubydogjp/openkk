import {
  MAX_ENTRY_LINES,
  parseAmount,
  parseIsoLocalDate,
} from "@rubydogjp/openkk-client-domain";

export function validateEntryDate(
  date: string,
  minDate: string | null,
  maxDate: string | null,
): string | null {
  if (parseIsoLocalDate(date) == null) {
    return "正しい日付を選択してください。";
  }
  if (minDate != null && date < minDate) {
    return `日付は会計期間（${formatDate(minDate)}〜${formatDate(maxDate ?? minDate)}）の範囲内で選択してください。`;
  }
  if (maxDate != null && date > maxDate) {
    return `日付は会計期間（${formatDate(minDate ?? maxDate)}〜${formatDate(maxDate)}）の範囲内で選択してください。`;
  }
  return null;
}

function formatDate(value: string): string {
  return value.replaceAll("-", "/");
}

export function validateEntryAmounts(
  debitAmounts: Iterable<string>,
  creditAmounts: Iterable<string>,
): string | null {
  return hasSafeTotal(debitAmounts) && hasSafeTotal(creditAmounts)
    ? null
    : unsafeAmountMessage;
}

function hasSafeTotal(amounts: Iterable<string>): boolean {
  let total = 0;
  for (const raw of amounts) {
    const amount = parseAmount(raw);
    total += amount;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(total)) {
      return false;
    }
  }
  return true;
}

export function validateBusinessRate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
    return businessRateMessage;
  }
  const rate = Number(trimmed);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100
    ? null
    : businessRateMessage;
}

export function validateEntryLineCount(count: number): string | null {
  if (!Number.isSafeInteger(count) || count < 0) {
    return "仕訳明細の件数を確認できませんでした。";
  }
  if (count > MAX_ENTRY_LINES) {
    return `1件の仕訳に登録できる明細は${MAX_ENTRY_LINES.toLocaleString("ja-JP")}件までです。`;
  }
  return null;
}

const unsafeAmountMessage =
  "仕訳金額または合計が大きすぎるため、安全に計算できる金額へ修正してください。";
const businessRateMessage = "事業割合は0から100までの数値で入力してください。";
