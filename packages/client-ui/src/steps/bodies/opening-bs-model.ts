import {
  balanceSheetRowLabel,
  balanceSheetSlots,
  OPENING_EQUITY_LABELS,
  type BalanceSheetSide,
  type BookAccountType,
} from "@rubydogjp/openkk-client-domain";

type OpeningLine = { accountId: string; amount: number };

export const assetKey = (label: string) => `a:${label}`;
export const liabilityKey = (label: string) => `l:${label}`;
export const liabilityAccountType = (label: string): BookAccountType =>
  OPENING_EQUITY_LABELS.has(label) ? "equity" : "liability";

export function parseOpeningAmount(value: string | number): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value.replace(/[^0-9]/g, ""));
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
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
    const { side, name } = splitAccountId(line.accountId);
    const label = balanceSheetRowLabel(side, name) ?? name;
    const key = side === "asset" ? assetKey(label) : liabilityKey(label);
    amounts.set(key, (amounts.get(key) ?? 0) + line.amount);
  }
  return Object.fromEntries(
    [...amounts].map(([accountId, amount]) => [accountId, String(amount)]),
  );
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
} {
  return {
    side: accountId.startsWith("a:") ? "asset" : "liability",
    name: accountId.slice(2),
  };
}
