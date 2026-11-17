import {
  CAPITAL_ACCOUNT_NAME,
  formatAmount,
  formatSignedAmountText,
  isNegativeCapitalLine,
  NEGATIVE_CAPITAL_ACCOUNT_ID,
  balanceSheetRowLabel,
  isWholeAmountText,
  balanceSheetSlots,
  OPENING_EQUITY_LABELS,
  type BalanceSheetSide,
  type BookAccountType,
} from "@rubydogjp/openkk-driver";

type OpeningLine = { accountId: string; amount: number };

export const assetKey = (label: string) => `a:${label}`;
export const liabilityKey = (label: string) => `l:${label}`;
export const liabilityAccountType = (label: string): BookAccountType =>
  OPENING_EQUITY_LABELS.has(label) ? "equity" : "liability";

export function parseOpeningAmount(value: string | number): number | null {
  if (typeof value === "string" && !isWholeAmountText(value)) return null;
  const parsed =
    typeof value === "number" ? value : Number(value.replace(/[^0-9]/g, ""));
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

const CAPITAL_ROW_KEY = `l:${CAPITAL_ACCOUNT_NAME}`;
const NEGATIVE_SIGN_PATTERN = /^[-−－△]/;

function parseCapitalAmount(value: string): number | null {
  const text = value.trim();
  const negative = NEGATIVE_SIGN_PATTERN.test(text);
  const amount = parseOpeningAmount(negative ? text.slice(1) : text);
  if (amount == null) return null;
  return negative ? -amount : amount;
}

function parseRowAmount(key: string, value: string): number | null {
  return key === CAPITAL_ROW_KEY
    ? parseCapitalAmount(value)
    : parseOpeningAmount(value);
}

export function openingAmountsAreValid(
  amounts: Record<string, string>,
): boolean {
  return Object.entries(amounts).every(
    ([key, value]) => parseRowAmount(key, value) != null,
  );
}

export function formatOpeningRowAmount(key: string, value: string): string {
  if (value.trim() === "") return "";
  const amount = parseRowAmount(key, value);
  if (amount == null) return value;
  return key === CAPITAL_ROW_KEY
    ? formatSignedAmountText(amount)
    : formatAmount(amount);
}

export function isCapitalRow(key: string): boolean {
  return key === CAPITAL_ROW_KEY;
}

export function sumOpeningAmounts(
  values: Iterable<string | number>,
): number | null {
  let total = 0;
  for (const value of values) {
    const amount = parseOpeningAmount(value);
    if (amount == null) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function sumOpeningSection(
  side: BalanceSheetSide,
  labels: string[],
  amounts: Record<string, string>,
  preservedLines: OpeningLine[],
): number | null {
  const key = side === "asset" ? assetKey : liabilityKey;
  let total = 0;
  for (const label of labels) {
    if (label === "") continue;
    const amount = parseRowAmount(key(label), amounts[key(label)] ?? "");
    if (amount == null) return null;
    total += amount;
  }
  for (const line of preservedLines) {
    const account = splitAccountId(line.accountId);
    if (account.side !== side) continue;
    total += account.sign * line.amount;
  }
  return Number.isSafeInteger(total) ? total : null;
}

export function buildAssetLabels(
  openingBalanceLines: Array<{ accountId: string }>,
): string[] {
  return buildRowLabels("asset", openingBalanceLines);
}

export function buildLiabilityLabels(
  openingBalanceLines: Array<{ accountId: string }>,
): string[] {
  return buildRowLabels("liability", openingBalanceLines);
}

export function buildInitialAmounts(
  openingBalanceLines: OpeningLine[],
): Record<string, string> {
  const amounts = new Map<string, number>();
  for (const line of openingBalanceLines) {
    if (line.amount <= 0) continue;
    const { side, name, sign } = splitAccountId(line.accountId);
    const label = balanceSheetRowLabel(side, name) ?? name;
    const key = side === "asset" ? assetKey(label) : liabilityKey(label);
    amounts.set(key, (amounts.get(key) ?? 0) + sign * line.amount);
  }
  return Object.fromEntries(
    [...amounts].map(([key, amount]) => [key, String(amount)]),
  );
}

export function enteredOpeningLines(
  side: BalanceSheetSide,
  labels: string[],
  amounts: Record<string, string>,
  storedLines: OpeningLine[],
): Array<{ id: string; accountId: string; amount: number }> {
  const key = side === "asset" ? assetKey : liabilityKey;
  return labels.flatMap((label) => {
    if (label === "") return [];
    if (isCapitalRow(key(label))) {
      const capital = parseCapitalAmount(amounts[key(label)] ?? "") ?? 0;
      if (capital === 0) return [];
      const accountId =
        capital < 0 ? NEGATIVE_CAPITAL_ACCOUNT_ID : CAPITAL_ROW_KEY;
      return [{ id: accountId, accountId, amount: Math.abs(capital) }];
    }
    const amount = parseOpeningAmount(amounts[key(label)] ?? "") ?? 0;
    if (amount <= 0) return [];
    const storedInRow = storedLines.filter((line) => {
      if (line.amount <= 0) return false;
      const account = splitAccountId(line.accountId);
      return (
        account.side === side &&
        (balanceSheetRowLabel(side, account.name) ?? account.name) === label
      );
    });
    const storedTotal = storedInRow.reduce((sum, line) => sum + line.amount, 0);
    if (storedInRow.length > 0 && storedTotal === amount) {
      return storedInRow.map((line) => ({
        id: line.accountId,
        accountId: line.accountId,
        amount: line.amount,
      }));
    }
    const accountId = storedInRow[0]?.accountId ?? key(label);
    return [{ id: accountId, accountId, amount }];
  });
}

export function unrenderedOpeningLines<Line extends OpeningLine>(
  openingBalanceLines: Line[],
  assetLabels: string[],
  liabilityLabels: string[],
): Line[] {
  return openingBalanceLines.filter((line) => {
    if (line.amount <= 0) return false;
    const { side, name } = splitAccountId(line.accountId);
    const labels = side === "asset" ? assetLabels : liabilityLabels;
    return balanceSheetRowLabel(side, name) == null && !labels.includes(name);
  });
}

function buildRowLabels(
  side: BalanceSheetSide,
  openingBalanceLines: Array<{ accountId: string }>,
): string[] {
  const extraLabels = [
    ...new Set(
      openingBalanceLines
        .map((line) => splitAccountId(line.accountId))
        .filter(
          (account) =>
            account.side === side &&
            account.name !== "" &&
            balanceSheetRowLabel(side, account.name) == null,
        )
        .map((account) => account.name),
    ),
  ];
  return balanceSheetSlots(side).map((slot) =>
    slot.kind === "account"
      ? slot.label
      : slot.kind === "extra"
        ? (extraLabels.shift() ?? "")
        : "",
  );
}

function splitAccountId(accountId: string): {
  side: BalanceSheetSide;
  name: string;
  sign: 1 | -1;
} {
  if (isNegativeCapitalLine({ accountId })) {
    return { side: "liability", name: CAPITAL_ACCOUNT_NAME, sign: -1 };
  }
  return {
    side: accountId.startsWith("a:") ? "asset" : "liability",
    name: accountId.slice(2),
    sign: 1,
  };
}
