import type { EntryRecord } from "../entries/entry-record.js";
import type { OpeningBalanceLine } from "../shared/models.js";
import { parseAmount } from "../shared/parse-utils.js";
import {
  ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS,
  BALANCE_SHEET_ROWS,
  OPENING_EQUITY_LABELS,
  balanceSheetExtraSlotCount,
  balanceSheetRowLabel,
  type BalanceSheetSlot,
} from "../shared/balance-sheet-layout.js";

export type FsBsRow = {
  assetLabel: string;
  assetOpening: number | null;
  assetClosing: number | null;
  liabilityLabel: string;
  liabilityOpening: number | null;
  liabilityClosing: number | null;
};

export type FsExpenseWriteIn = { row: number; label: string; amount: number };

export type FsSummary = {
  revenue: number;
  expenses: number;
  profit: number;
  assets: number;
  liabilities: number;
  equity: number;
};

export type FsAggregate = {
  amounts: Record<number, number | null>;
  bsRows: FsBsRow[];
  expenseWriteIns: FsExpenseWriteIn[];
  summary: FsSummary;
};

const NAMED_EXPENSE_ACCOUNTS = new Set<string>([
  "租税公課",
  "荷造運賃",
  "水道光熱費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "接待交際費",
  "保険料",
  "修繕費",
  "消耗品費",
  "減価償却費",
  "福利厚生費",
  "給与手当",
  "外注費",
  "支払利息",
  "地代家賃",
  "貸倒損失",
  "会議費",
  "雑費",
]);

const RESERVE_AND_FAMILY_ACCOUNTS = new Set<string>([
  "専従者給与",
  "貸倒引当金繰入",
]);

const EXPENSE_WRITE_IN_ROWS = [26, 27, 28, 29, 30];

function addAmount(map: Map<string, number>, name: string, delta: number) {
  if (!name) return;
  map.set(name, (map.get(name) ?? 0) + delta);
}

function sumValues(map: Map<string, number>): number {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function sumByNames(map: Map<string, number>, names: string[]): number {
  return names.reduce((total, name) => total + (map.get(name) ?? 0), 0);
}

function nonZeroOrNull(value: number): number | null {
  return value === 0 ? null : value;
}

type BalanceSheetCells = [string, number | null, number | null];

type BalanceSheetItem = { name: string; opening: number; closing: number };

function balanceCells(
  label: string,
  opening: number,
  closing: number,
): BalanceSheetCells {
  return [label, nonZeroOrNull(opening), nonZeroOrNull(closing)];
}

function extraCells(item: BalanceSheetItem | null): BalanceSheetCells {
  return item == null
    ? ["", null, null]
    : balanceCells(item.name, item.opening, item.closing);
}

function fitToSlots(
  items: BalanceSheetItem[],
  slotCount: number,
): BalanceSheetItem[] {
  const shown = items.filter((item) => item.opening !== 0 || item.closing !== 0);
  if (shown.length <= slotCount) return shown;
  const overflow = shown.slice(slotCount - 1);
  return [
    ...shown.slice(0, slotCount - 1),
    {
      name: "その他",
      opening: overflow.reduce((sum, item) => sum + item.opening, 0),
      closing: overflow.reduce((sum, item) => sum + item.closing, 0),
    },
  ];
}

function bsRow(
  [assetLabel, assetOpening, assetClosing]: BalanceSheetCells,
  [liabilityLabel, liabilityOpening, liabilityClosing]: BalanceSheetCells,
): FsBsRow {
  return {
    assetLabel,
    assetOpening,
    assetClosing,
    liabilityLabel,
    liabilityOpening,
    liabilityClosing,
  };
}

function reclassifyContraryBalances(
  assets: Map<string, number>,
  liabilities: Map<string, number>,
): void {
  const names = new Set([...assets.keys(), ...liabilities.keys()]);
  for (const name of names) {
    const netAsset = (assets.get(name) ?? 0) - (liabilities.get(name) ?? 0);
    assets.delete(name);
    liabilities.delete(name);
    if (netAsset > 0) assets.set(name, netAsset);
    if (netAsset < 0) liabilities.set(name, Math.abs(netAsset));
  }
}

export function computeFsAggregate({
  entries,
  openingBalanceLines,
}: {
  entries: EntryRecord[];
  openingBalanceLines: OpeningBalanceLine[];
}): FsAggregate {
  const revenueByName = new Map<string, number>();
  const expenseByName = new Map<string, number>();
  const costOfSalesByName = new Map<string, number>();
  const assetNetByName = new Map<string, number>();
  const liabilityNetByName = new Map<string, number>();
  const equityNetByName = new Map<string, number>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const amount = parseAmount(line.amount);
      const sign = line.side === "debit" ? 1 : -1;

      if (line.accountType === "revenue") {
        addAmount(revenueByName, line.accountName, -sign * amount);
      }
      if (line.accountType === "expense") {
        addAmount(expenseByName, line.accountName, sign * amount);
      }
      if (line.accountType === "cost_of_sales") {
        addAmount(costOfSalesByName, line.accountName, sign * amount);
      }
      if (line.accountType === "asset") {
        addAmount(assetNetByName, line.accountName, sign * amount);
      }
      if (line.accountType === "liability") {
        addAmount(liabilityNetByName, line.accountName, -sign * amount);
      }
      if (line.accountType === "equity") {
        addAmount(equityNetByName, line.accountName, -sign * amount);
      }
    }
  }

  const assetOpeningByName = new Map<string, number>();
  const liabilityOpeningByName = new Map<string, number>();
  const equityOpeningByName = new Map<string, number>();
  for (const line of openingBalanceLines) {
    if (line.accountId.startsWith("a:")) {
      assetOpeningByName.set(line.accountId.slice(2), line.amount);
    } else if (line.accountId.startsWith("l:")) {
      const name = line.accountId.slice(2);
      if (OPENING_EQUITY_LABELS.has(name))
        equityOpeningByName.set(name, line.amount);
      else liabilityOpeningByName.set(name, line.amount);
    }
  }

  function closingMap(
    opening: Map<string, number>,
    net: Map<string, number>,
  ): Map<string, number> {
    const result = new Map<string, number>(opening);
    for (const [name, value] of net) {
      result.set(name, (result.get(name) ?? 0) + value);
    }
    return result;
  }
  const assetClosingByName = closingMap(assetOpeningByName, assetNetByName);
  const liabilityClosingByName = closingMap(
    liabilityOpeningByName,
    liabilityNetByName,
  );
  const equityClosingByName = closingMap(equityOpeningByName, equityNetByName);
  reclassifyContraryBalances(assetClosingByName, liabilityClosingByName);

  const revenueTotal = sumValues(revenueByName);
  const costOfSalesTotal = sumValues(costOfSalesByName);
  const expensesTotal = sumValues(expenseByName);
  const grossProfit = revenueTotal - costOfSalesTotal;
  const profit = grossProfit - expensesTotal;
  const badDebtReversal = revenueByName.get("貸倒引当金戻入") ?? 0;
  const badDebtProvision = expenseByName.get("貸倒引当金繰入") ?? 0;
  const familyEmployeeSalary = expenseByName.get("専従者給与") ?? 0;
  const salesForDisplay = revenueTotal - badDebtReversal;
  const grossProfitForDisplay = salesForDisplay - costOfSalesTotal;
  const operatingExpensesForDisplay =
    expensesTotal - badDebtProvision - familyEmployeeSalary;
  const ordinaryIncomeForDisplay =
    grossProfitForDisplay - operatingExpensesForDisplay;
  const reversalSubtotal = badDebtReversal;
  const provisionSubtotal = familyEmployeeSalary + badDebtProvision;

  const allowanceOpeningBalance =
    (liabilityOpeningByName.get(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS) ?? 0) -
    (assetOpeningByName.get(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS) ?? 0);
  const allowanceClosingBalance =
    (liabilityClosingByName.get(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS) ?? 0) -
    (assetClosingByName.get(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS) ?? 0);
  assetOpeningByName.delete(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS);
  assetClosingByName.delete(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS);
  liabilityOpeningByName.delete(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS);
  liabilityClosingByName.delete(ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS);
  const allowanceOpening = Math.max(0, allowanceOpeningBalance);
  const allowanceClosing = Math.max(0, allowanceClosingBalance);
  if (allowanceOpeningBalance < 0) {
    assetOpeningByName.set(
      ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS,
      Math.abs(allowanceOpeningBalance),
    );
  }
  if (allowanceClosingBalance < 0) {
    assetClosingByName.set(
      ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS,
      Math.abs(allowanceClosingBalance),
    );
  }

  const expense = (label: string): number | null => {
    const amount = expenseByName.get(label) ?? 0;
    return amount > 0 ? amount : null;
  };
  const purchasesAmount = sumByNames(costOfSalesByName, ["仕入", "商品仕入高"]);
  const purchases = purchasesAmount > 0 ? purchasesAmount : null;

  const writeInCandidates = [...expenseByName.entries()]
    .filter(
      ([name, value]) =>
        value > 0 &&
        !NAMED_EXPENSE_ACCOUNTS.has(name) &&
        !RESERVE_AND_FAMILY_ACCOUNTS.has(name),
    )
    .sort((left, right) => right[1] - left[1]);
  const expenseWriteIns: FsExpenseWriteIn[] = writeInCandidates
    .slice(0, EXPENSE_WRITE_IN_ROWS.length)
    .map(([label, amount], slot) => ({
      row: EXPENSE_WRITE_IN_ROWS[slot]!,
      label,
      amount,
    }));
  const writeInOverflow = writeInCandidates
    .slice(EXPENSE_WRITE_IN_ROWS.length)
    .reduce((sum, [, value]) => sum + value, 0);
  const miscTotal = (expenseByName.get("雑費") ?? 0) + writeInOverflow;
  const writeInAmount = (row: number): number | null =>
    expenseWriteIns.find((writeIn) => writeIn.row === row)?.amount ?? null;

  const amounts: Record<number, number | null> = {
    1: salesForDisplay !== 0 ? salesForDisplay : null,
    2: null,
    3: purchases,
    4: purchases ?? 0,
    5: null,
    6: costOfSalesTotal,
    7: grossProfitForDisplay,
    8: expense("租税公課"),
    9: expense("荷造運賃"),
    10: expense("水道光熱費"),
    11: expense("旅費交通費"),
    12: expense("通信費"),
    13: expense("広告宣伝費"),
    14: expense("接待交際費"),
    15: expense("保険料"),
    16: expense("修繕費"),
    17: expense("消耗品費"),
    18: expense("減価償却費"),
    19: expense("福利厚生費"),
    20: expense("給与手当"),
    21: expense("外注費"),
    22: expense("支払利息"),
    23: expense("地代家賃"),
    24: expense("貸倒損失"),
    25: expense("会議費"),
    26: writeInAmount(26),
    27: writeInAmount(27),
    28: writeInAmount(28),
    29: writeInAmount(29),
    30: writeInAmount(30),
    31: miscTotal > 0 ? miscTotal : null,
    32: operatingExpensesForDisplay,
    33: ordinaryIncomeForDisplay,
    34: badDebtReversal > 0 ? badDebtReversal : null,
    35: null,
    36: null,
    37: reversalSubtotal,
    38: familyEmployeeSalary > 0 ? familyEmployeeSalary : null,
    39: badDebtProvision > 0 ? badDebtProvision : null,
    40: null,
    41: null,
    42: provisionSubtotal,
    43: profit,
  };

  const assetExtras = fitToSlots(
    [...new Set([...assetOpeningByName.keys(), ...assetClosingByName.keys()])]
      .filter((name) => balanceSheetRowLabel("asset", name) == null)
      .map((name) => ({
        name,
        opening: assetOpeningByName.get(name) ?? 0,
        closing: assetClosingByName.get(name) ?? 0,
      })),
    balanceSheetExtraSlotCount("asset"),
  );
  const liabilityExtras = fitToSlots(
    [
      ...new Set([
        ...liabilityOpeningByName.keys(),
        ...liabilityClosingByName.keys(),
        ...equityOpeningByName.keys(),
        ...equityClosingByName.keys(),
      ]),
    ]
      .filter((name) => balanceSheetRowLabel("liability", name) == null)
      .map((name) => ({
        name,
        opening:
          (liabilityOpeningByName.get(name) ?? 0) +
          (equityOpeningByName.get(name) ?? 0),
        closing:
          (liabilityClosingByName.get(name) ?? 0) +
          (equityClosingByName.get(name) ?? 0),
      })),
    balanceSheetExtraSlotCount("liability"),
  );

  const openingAssetsTotal = sumValues(assetOpeningByName);
  const openingLiabilitiesTotal =
    sumValues(liabilityOpeningByName) +
    sumValues(equityOpeningByName) +
    allowanceOpening;
  const assetsTotal = sumValues(assetClosingByName);
  const liabilitiesAndEquityTotal =
    sumValues(liabilityClosingByName) +
    sumValues(equityClosingByName) +
    profit +
    allowanceClosing;

  const assetCells = (slot: BalanceSheetSlot) => {
    if (slot.kind !== "account") return extraCells(assetExtras.shift() ?? null);
    const names = [slot.label, ...slot.aliases];
    return balanceCells(
      slot.label,
      sumByNames(assetOpeningByName, names),
      sumByNames(assetClosingByName, names),
    );
  };
  const liabilityCells = (slot: BalanceSheetSlot) => {
    if (slot.kind === "profit") {
      return balanceCells("青色申告特別控除前の所得金額", 0, profit);
    }
    if (slot.kind === "extra") return extraCells(liabilityExtras.shift() ?? null);
    if (slot.label === ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS) {
      return balanceCells(slot.label, allowanceOpening, allowanceClosing);
    }
    const names = [slot.label, ...slot.aliases];
    return balanceCells(
      slot.label,
      sumByNames(liabilityOpeningByName, names) +
        sumByNames(equityOpeningByName, names),
      sumByNames(liabilityClosingByName, names) +
        sumByNames(equityClosingByName, names),
    );
  };

  const bsRows: FsBsRow[] = BALANCE_SHEET_ROWS.map(({ asset, liability }) =>
    bsRow(assetCells(asset), liabilityCells(liability)),
  );
  bsRows.push(
    bsRow(
      balanceCells("合計", openingAssetsTotal, assetsTotal),
      balanceCells("合計", openingLiabilitiesTotal, liabilitiesAndEquityTotal),
    ),
  );

  const summary: FsSummary = {
    revenue: revenueTotal,
    expenses: costOfSalesTotal + expensesTotal,
    profit,
    assets: assetsTotal,
    liabilities: sumValues(liabilityClosingByName) + allowanceClosing,
    equity: sumValues(equityClosingByName) + profit,
  };

  return {
    amounts,
    bsRows,
    expenseWriteIns,
    summary,
  };
}
