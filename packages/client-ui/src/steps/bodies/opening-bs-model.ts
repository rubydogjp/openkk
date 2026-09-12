import {
  OPENING_EQUITY_LABELS,
  type BookAccountType,
} from "@rubydogjp/openkk-client-domain";

export const BS_ROWS: Array<{
  assetLabel: string;
  liabilityLabel: string;
}> = [
  { assetLabel: "現金", liabilityLabel: "支払手形" },
  { assetLabel: "当座預金", liabilityLabel: "買掛金" },
  { assetLabel: "定期預金", liabilityLabel: "借入金" },
  { assetLabel: "その他の預金", liabilityLabel: "未払金" },
  { assetLabel: "受取手形", liabilityLabel: "前受金" },
  { assetLabel: "売掛金", liabilityLabel: "預り金" },
  { assetLabel: "有価証券", liabilityLabel: "" },
  { assetLabel: "棚卸資産", liabilityLabel: "" },
  { assetLabel: "前払金", liabilityLabel: "" },
  { assetLabel: "貸付金", liabilityLabel: "" },
  { assetLabel: "建物", liabilityLabel: "" },
  { assetLabel: "建物附属設備", liabilityLabel: "" },
  { assetLabel: "機械装置", liabilityLabel: "" },
  { assetLabel: "車両運搬具", liabilityLabel: "貸倒引当金" },
  { assetLabel: "工具器具備品", liabilityLabel: "" },
  { assetLabel: "土地", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "事業主借" },
  { assetLabel: "", liabilityLabel: "元入金" },
  { assetLabel: "事業主貸", liabilityLabel: "" },
];

const HANDLED_ASSET_NAMES = new Set<string>([
  "現金",
  "当座預金",
  "普通預金",
  "定期預金",
  "その他の預金",
  "受取手形",
  "売掛金",
  "有価証券",
  "棚卸資産",
  "商品",
  "前払金",
  "前払費用",
  "貸付金",
  "建物",
  "建物附属設備",
  "機械装置",
  "車両運搬具",
  "工具器具備品",
  "土地",
  "事業主貸",
]);

const HANDLED_LIABILITY_NAMES = new Set<string>(
  BS_ROWS.map((row) => row.liabilityLabel).filter((label) => label !== ""),
);

const EQUITY_LABELS = OPENING_EQUITY_LABELS;

export const assetKey = (label: string) => `a:${label}`;
export const liabilityKey = (label: string) => `l:${label}`;
export const isEditableLiability = (label: string) => label !== "";
export const liabilityAccountType = (label: string): BookAccountType =>
  EQUITY_LABELS.has(label) ? "equity" : "liability";

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

type AssetSlot = { kind: "fixed" | "extra"; label: string };
type LiabilitySlot = { kind: "fixed" | "extra"; label: string };

export function buildAssetSlots(
  openingBalanceLines: Array<{ accountId: string }>,
): AssetSlot[] {
  const extras: string[] = [];
  const seen = new Set<string>();
  for (const line of openingBalanceLines) {
    if (!line.accountId.startsWith("a:")) continue;
    const name = line.accountId.slice(2);
    if (HANDLED_ASSET_NAMES.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    extras.push(name);
  }
  return BS_ROWS.map((row, index): AssetSlot => {
    if (row.assetLabel !== "") return { kind: "fixed", label: row.assetLabel };
    if (index >= 16 && index <= 21) {
      const extraIndex = index - 16;
      return { kind: "extra", label: extras[extraIndex] ?? "" };
    }
    return { kind: "fixed", label: "" };
  });
}

export function buildLiabilitySlots(
  openingBalanceLines: Array<{ accountId: string }>,
): LiabilitySlot[] {
  const extras: string[] = [];
  const seen = new Set<string>();
  for (const line of openingBalanceLines) {
    if (!line.accountId.startsWith("l:")) continue;
    const name = line.accountId.slice(2);
    if (name === "" || HANDLED_LIABILITY_NAMES.has(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    extras.push(name);
  }

  return BS_ROWS.map((row): LiabilitySlot => {
    if (row.liabilityLabel !== "") {
      return { kind: "fixed", label: row.liabilityLabel };
    }
    return { kind: "extra", label: extras.shift() ?? "" };
  });
}

export function buildInitialAmounts(
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
): Record<string, string> {
  const amounts = new Map<string, number>();
  for (const line of openingBalanceLines) {
    if (line.amount <= 0) continue;
    const accountId =
      line.accountId === "a:普通預金" ? "a:その他の預金" : line.accountId;
    amounts.set(accountId, (amounts.get(accountId) ?? 0) + line.amount);
  }
  return Object.fromEntries(
    [...amounts].map(([accountId, amount]) => [accountId, String(amount)]),
  );
}
