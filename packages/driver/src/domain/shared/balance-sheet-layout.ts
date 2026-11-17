export type BalanceSheetSide = "asset" | "liability";

export type BalanceSheetSlot =
  | { kind: "account"; label: string; aliases: string[] }
  | { kind: "extra" }
  | { kind: "profit" };

export type BalanceSheetRow = {
  asset: BalanceSheetSlot;
  liability: BalanceSheetSlot;
};

const account = (label: string, ...aliases: string[]): BalanceSheetSlot => ({
  kind: "account",
  label,
  aliases,
});
const extra: BalanceSheetSlot = { kind: "extra" };
const profit: BalanceSheetSlot = { kind: "profit" };

export const ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS = "貸倒引当金";

export const OPENING_EQUITY_LABELS = new Set<string>(["事業主借", "元入金"]);

export const BALANCE_SHEET_ROWS: ReadonlyArray<BalanceSheetRow> = [
  { asset: account("現金"), liability: account("支払手形") },
  { asset: account("当座預金"), liability: account("買掛金") },
  { asset: account("定期預金"), liability: account("借入金", "長期借入金") },
  { asset: account("その他の預金", "普通預金"), liability: account("未払金") },
  { asset: account("受取手形"), liability: account("前受金") },
  { asset: account("売掛金"), liability: account("預り金") },
  { asset: account("有価証券"), liability: extra },
  { asset: account("棚卸資産", "商品"), liability: extra },
  { asset: account("前払金", "前払費用"), liability: extra },
  { asset: account("貸付金"), liability: extra },
  { asset: account("建物"), liability: extra },
  { asset: account("建物附属設備"), liability: extra },
  { asset: account("機械装置"), liability: extra },
  {
    asset: account("車両運搬具"),
    liability: account(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS),
  },
  { asset: account("工具器具備品"), liability: extra },
  { asset: account("土地"), liability: extra },
  { asset: extra, liability: extra },
  { asset: extra, liability: extra },
  { asset: extra, liability: extra },
  { asset: extra, liability: extra },
  { asset: extra, liability: account("事業主借") },
  { asset: extra, liability: account("元入金") },
  { asset: account("事業主貸"), liability: profit },
];

export function balanceSheetSlots(
  side: BalanceSheetSide,
): ReadonlyArray<BalanceSheetSlot> {
  return BALANCE_SHEET_ROWS.map((row) => row[side]);
}

export function balanceSheetRowLabel(
  side: BalanceSheetSide,
  accountName: string,
): string | null {
  for (const slot of balanceSheetSlots(side)) {
    if (
      slot.kind === "account" &&
      (slot.label === accountName || slot.aliases.includes(accountName))
    ) {
      return slot.label;
    }
  }
  return null;
}

export function balanceSheetExtraSlotCount(side: BalanceSheetSide): number {
  return balanceSheetSlots(side).filter((slot) => slot.kind === "extra").length;
}

export const CAPITAL_ACCOUNT_NAME = "元入金";
export const NEGATIVE_CAPITAL_ACCOUNT_ID = `a:${CAPITAL_ACCOUNT_NAME}`;

export function isNegativeCapitalLine(line: { accountId: string }): boolean {
  return line.accountId === NEGATIVE_CAPITAL_ACCOUNT_ID;
}

export function openingSideTotals(
  lines: ReadonlyArray<{ accountId: string; amount: number }>,
): { assets: number; liabilitiesAndEquity: number } {
  let assets = 0;
  let liabilitiesAndEquity = 0;
  for (const line of lines) {
    if (isNegativeCapitalLine(line)) liabilitiesAndEquity -= line.amount;
    else if (line.accountId.startsWith("a:")) assets += line.amount;
    else liabilitiesAndEquity += line.amount;
  }
  return { assets, liabilitiesAndEquity };
}

export function formatSignedAmountText(amount: number): string {
  const grouped = new Intl.NumberFormat("ja-JP").format(Math.abs(amount));
  return amount < 0 ? `△${grouped}` : grouped;
}
