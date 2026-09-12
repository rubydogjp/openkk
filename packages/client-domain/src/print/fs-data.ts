import type { EntryRecord } from "../entries/entry-record.js";
import { parseAmount } from "../shared/parse-utils.js";
import { OPENING_EQUITY_LABELS } from "../steps/summary.js";

export type FsBsRow = {
  assetLabel: string;
  assetOpening: number | null;
  assetClosing: number | null;
  liabilityLabel: string;
  liabilityOpening: number | null;
  liabilityClosing: number | null;
};

export type FsExpenseWriteIn = { label: string; amount: number };

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
  nextPeriodOpeningBalanceLines: OpeningBalanceLine[];
  summary: FsSummary;
};

export type OpeningBalanceLine = { accountId: string; amount: number };

type ClosingBalance = {
  side: "asset" | "liability";
  accountName: string;
  amount: number;
};

function buildNextPeriodOpeningBalanceLines(
  closingBalances: Iterable<ClosingBalance>,
): OpeningBalanceLine[] {
  const amounts = new Map<string, number>();
  const fold = (accountId: string, amount: number) => {
    amounts.set(accountId, (amounts.get(accountId) ?? 0) + amount);
  };

  for (const { side, accountName, amount } of closingBalances) {
    if (accountName === "事業主貸") {
      fold("l:元入金", -amount);
      continue;
    }
    if (
      accountName === "事業主借" ||
      accountName === "元入金" ||
      accountName === "青色申告特別控除前の所得金額"
    ) {
      fold("l:元入金", amount);
      continue;
    }
    if (amount === 0) continue;
    const prefix = side === "asset" ? "a" : "l";
    if (amount > 0) {
      fold(`${prefix}:${accountName}`, amount);
    } else {
      fold(
        `${prefix === "a" ? "l" : "a"}:${accountName}`,
        Math.abs(amount),
      );
    }
  }

  const carriedCapital = amounts.get("l:元入金") ?? 0;
  if (carriedCapital < 0) {
    amounts.delete("l:元入金");
    fold("a:事業主貸", Math.abs(carriedCapital));
  }

  return [...amounts.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([accountId, amount]) => ({
      accountId,
      amount,
    }));
}

function add(map: Map<string, number>, name: string, delta: number) {
  if (!name) return;
  map.set(name, (map.get(name) ?? 0) + delta);
}

function sumValues(map: Map<string, number>): number {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
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

  for (const e of entries) {
    for (const line of e.lines) {
      const amount = parseAmount(line.amount);
      const sign = line.side === "debit" ? 1 : -1;

      if (line.accountType === "revenue") {
        add(revenueByName, line.accountName, -sign * amount);
      }
      if (line.accountType === "expense") {
        add(expenseByName, line.accountName, sign * amount);
      }
      if (line.accountType === "cost_of_sales") {
        add(costOfSalesByName, line.accountName, sign * amount);
      }
      if (line.accountType === "asset") {
        add(assetNetByName, line.accountName, sign * amount);
      }
      if (line.accountType === "liability") {
        add(liabilityNetByName, line.accountName, -sign * amount);
      }
      if (line.accountType === "equity") {
        add(equityNetByName, line.accountName, -sign * amount);
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
    const result = new Map<string, number>();
    for (const [n, v] of opening) result.set(n, v);
    for (const [n, v] of net) result.set(n, (result.get(n) ?? 0) + v);
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

  const ALLOWANCE_FOR_DOUBTFUL = "貸倒引当金";
  const allowanceOpeningBalance =
    (liabilityOpeningByName.get(ALLOWANCE_FOR_DOUBTFUL) ?? 0) -
    (assetOpeningByName.get(ALLOWANCE_FOR_DOUBTFUL) ?? 0);
  const allowanceClosingBalance =
    (liabilityClosingByName.get(ALLOWANCE_FOR_DOUBTFUL) ?? 0) -
    (assetClosingByName.get(ALLOWANCE_FOR_DOUBTFUL) ?? 0);
  assetOpeningByName.delete(ALLOWANCE_FOR_DOUBTFUL);
  assetClosingByName.delete(ALLOWANCE_FOR_DOUBTFUL);
  liabilityOpeningByName.delete(ALLOWANCE_FOR_DOUBTFUL);
  liabilityClosingByName.delete(ALLOWANCE_FOR_DOUBTFUL);
  const allowanceOpening = Math.max(0, allowanceOpeningBalance);
  const allowanceClosing = Math.max(0, allowanceClosingBalance);
  if (allowanceOpeningBalance < 0) {
    assetOpeningByName.set(
      ALLOWANCE_FOR_DOUBTFUL,
      Math.abs(allowanceOpeningBalance),
    );
  }
  if (allowanceClosingBalance < 0) {
    assetClosingByName.set(
      ALLOWANCE_FOR_DOUBTFUL,
      Math.abs(allowanceClosingBalance),
    );
  }

  const expense = (label: string): number | null => {
    const v = expenseByName.get(label) ?? 0;
    return v > 0 ? v : null;
  };
  const cost = (label: string, ...aliases: string[]): number | null => {
    let v = costOfSalesByName.get(label) ?? 0;
    for (const a of aliases) v += costOfSalesByName.get(a) ?? 0;
    return v > 0 ? v : null;
  };
  const purchases = cost("仕入", "商品仕入高");

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
  const WRITE_IN_SLOT_COUNT = 4;
  const writeInCandidates = [...expenseByName.entries()]
    .filter(
      ([name, value]) =>
        value > 0 &&
        !NAMED_EXPENSE_ACCOUNTS.has(name) &&
        !RESERVE_AND_FAMILY_ACCOUNTS.has(name),
    )
    .sort((left, right) => right[1] - left[1]);
  const expenseWriteIns = writeInCandidates
    .slice(0, WRITE_IN_SLOT_COUNT)
    .map(([label, amount]) => ({ label, amount }));
  const writeInOverflow = writeInCandidates
    .slice(WRITE_IN_SLOT_COUNT)
    .reduce((sum, [, value]) => sum + value, 0);
  const miscTotal = (expenseByName.get("雑費") ?? 0) + writeInOverflow;
  const writeInAmount = (slot: number): number | null =>
    expenseWriteIns[slot] ? expenseWriteIns[slot]!.amount : null;

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
    25: null,
    26: expense("会議費"),
    27: writeInAmount(0),
    28: writeInAmount(1),
    29: writeInAmount(2),
    30: writeInAmount(3),
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

  const av = (label: string, ...aliases: string[]): number => {
    let v = assetClosingByName.get(label) ?? 0;
    for (const a of aliases) v += assetClosingByName.get(a) ?? 0;
    return v;
  };
  const oav = (label: string, ...aliases: string[]): number => {
    let v = assetOpeningByName.get(label) ?? 0;
    for (const a of aliases) v += assetOpeningByName.get(a) ?? 0;
    return v;
  };
  const lvBoth = (
    closing: Map<string, number>,
    label: string,
    aliases: string[],
  ): number => {
    let v = closing.get(label) ?? 0;
    for (const a of aliases) v += closing.get(a) ?? 0;
    return v;
  };
  const lv = (label: string, ...aliases: string[]): number =>
    lvBoth(liabilityClosingByName, label, aliases) +
    lvBoth(equityClosingByName, label, aliases);
  const olv = (label: string, ...aliases: string[]): number =>
    lvBoth(liabilityOpeningByName, label, aliases) +
    lvBoth(equityOpeningByName, label, aliases);

  const fmtBs = (v: number): number | null => (v === 0 ? null : v);

  const fmtVal = (v: number): number | null => (v === 0 ? null : v);

  const handledAssets = new Set([
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
  const extraAssetNames = new Set([
    ...assetOpeningByName.keys(),
    ...assetClosingByName.keys(),
  ]);
  const extras = [...extraAssetNames]
    .filter((name) => !handledAssets.has(name))
    .map(
      (name): [string, number] => [
        name,
        assetClosingByName.get(name) ?? 0,
      ],
    )
    .filter(
      ([name, closing]) =>
        closing !== 0 || (assetOpeningByName.get(name) ?? 0) !== 0,
    );
  const EXTRA_SLOT_COUNT = 6;
  const EXTRA_OVERFLOW_LABEL = "その他";
  const displayExtras: Array<{
    name: string;
    opening: number;
    closing: number;
  }> =
    extras.length <= EXTRA_SLOT_COUNT
      ? extras.map(([name, closing]) => ({ name, opening: oav(name), closing }))
      : [
          ...extras
            .slice(0, EXTRA_SLOT_COUNT - 1)
            .map(([name, closing]) => ({ name, opening: oav(name), closing })),
          {
            name: EXTRA_OVERFLOW_LABEL,
            opening: extras
              .slice(EXTRA_SLOT_COUNT - 1)
              .reduce((sum, [name]) => sum + oav(name), 0),
            closing: extras
              .slice(EXTRA_SLOT_COUNT - 1)
              .reduce((sum, [, value]) => sum + value, 0),
          },
        ];
  const extraName = (i: number) => displayExtras[i]?.name ?? "";
  const extraOpening = (i: number): number | null =>
    displayExtras[i] ? fmtBs(displayExtras[i]!.opening) : null;
  const extraClosing = (i: number): number | null =>
    displayExtras[i] ? fmtBs(displayExtras[i]!.closing) : null;

  const handledLiabilitiesAndEquity = new Set([
    "支払手形",
    "買掛金",
    "借入金",
    "長期借入金",
    "未払金",
    "前受金",
    "預り金",
    ALLOWANCE_FOR_DOUBTFUL,
    "事業主借",
    "元入金",
  ]);
  const liabilityExtraNames = new Set([
    ...liabilityOpeningByName.keys(),
    ...liabilityClosingByName.keys(),
    ...equityOpeningByName.keys(),
    ...equityClosingByName.keys(),
  ]);
  const liabilityExtras = [...liabilityExtraNames]
    .filter((name) => !handledLiabilitiesAndEquity.has(name))
    .map((name) => ({
      name,
      opening:
        (liabilityOpeningByName.get(name) ?? 0) +
        (equityOpeningByName.get(name) ?? 0),
      closing:
        (liabilityClosingByName.get(name) ?? 0) +
        (equityClosingByName.get(name) ?? 0),
    }))
    .filter((item) => item.opening !== 0 || item.closing !== 0);
  const LIABILITY_EXTRA_SLOT_COUNT = 13;
  const displayLiabilityExtras =
    liabilityExtras.length <= LIABILITY_EXTRA_SLOT_COUNT
      ? liabilityExtras
      : [
          ...liabilityExtras.slice(0, LIABILITY_EXTRA_SLOT_COUNT - 1),
          {
            name: "その他",
            opening: liabilityExtras
              .slice(LIABILITY_EXTRA_SLOT_COUNT - 1)
              .reduce((sum, item) => sum + item.opening, 0),
            closing: liabilityExtras
              .slice(LIABILITY_EXTRA_SLOT_COUNT - 1)
              .reduce((sum, item) => sum + item.closing, 0),
          },
        ];
  const liabilityExtra = (
    index: number,
  ): [string, number | null, number | null] => {
    const item = displayLiabilityExtras[index];
    return item == null
      ? ["", null, null]
      : [item.name, fmtBs(item.opening), fmtBs(item.closing)];
  };

  const openingAssetsTotal = sumValues(assetOpeningByName);
  const openingLiabsTotal =
    sumValues(liabilityOpeningByName) +
    sumValues(equityOpeningByName) +
    allowanceOpening;
  const assetsTotal = sumValues(assetClosingByName);

  const liabsAndEquityTotalDisplay =
    sumValues(liabilityClosingByName) +
    sumValues(equityClosingByName) +
    profit +
    allowanceClosing;

  const nextPeriodOpeningBalanceLines = buildNextPeriodOpeningBalanceLines([
    ...[...assetClosingByName].map(([accountName, amount]) => ({
      side: "asset" as const,
      accountName,
      amount,
    })),
    ...[...liabilityClosingByName].map(([accountName, amount]) => ({
      side: "liability" as const,
      accountName,
      amount,
    })),
    ...[...equityClosingByName].map(([accountName, amount]) => ({
      side: "liability" as const,
      accountName,
      amount,
    })),
    {
      side: "liability",
      accountName: ALLOWANCE_FOR_DOUBTFUL,
      amount: allowanceClosing,
    },
    {
      side: "liability",
      accountName: "青色申告特別控除前の所得金額",
      amount: profit,
    },
  ]);

  const r = (
    al: string,
    ao: number | null,
    ac: number | null,
    ll: string,
    lo: number | null,
    lc: number | null,
  ): FsBsRow => ({
    assetLabel: al,
    assetOpening: ao,
    assetClosing: ac,
    liabilityLabel: ll,
    liabilityOpening: lo,
    liabilityClosing: lc,
  });

  const bsRows: FsBsRow[] = [
    r(
      "現金",
      fmtBs(oav("現金")),
      fmtBs(av("現金")),
      "支払手形",
      fmtBs(olv("支払手形")),
      fmtBs(lv("支払手形")),
    ),
    r(
      "当座預金",
      fmtBs(oav("当座預金")),
      fmtBs(av("当座預金")),
      "買掛金",
      fmtBs(olv("買掛金")),
      fmtBs(lv("買掛金")),
    ),
    r(
      "定期預金",
      fmtBs(oav("定期預金")),
      fmtBs(av("定期預金")),
      "借入金",
      fmtBs(olv("借入金", "長期借入金")),
      fmtBs(lv("借入金", "長期借入金")),
    ),
    r(
      "その他の預金",
      fmtBs(oav("その他の預金", "普通預金")),
      fmtBs(av("その他の預金", "普通預金")),
      "未払金",
      fmtBs(olv("未払金")),
      fmtBs(lv("未払金")),
    ),
    r(
      "受取手形",
      fmtBs(oav("受取手形")),
      fmtBs(av("受取手形")),
      "前受金",
      fmtBs(olv("前受金")),
      fmtBs(lv("前受金")),
    ),
    r(
      "売掛金",
      fmtBs(oav("売掛金")),
      fmtBs(av("売掛金")),
      "預り金",
      fmtBs(olv("預り金")),
      fmtBs(lv("預り金")),
    ),
    r(
      "有価証券",
      fmtBs(oav("有価証券")),
      fmtBs(av("有価証券")),
      ...liabilityExtra(0),
    ),
    r(
      "棚卸資産",
      fmtBs(oav("棚卸資産", "商品")),
      fmtBs(av("棚卸資産", "商品")),
      ...liabilityExtra(1),
    ),
    r(
      "前払金",
      fmtBs(oav("前払金", "前払費用")),
      fmtBs(av("前払金", "前払費用")),
      ...liabilityExtra(2),
    ),
    r(
      "貸付金",
      fmtBs(oav("貸付金")),
      fmtBs(av("貸付金")),
      ...liabilityExtra(3),
    ),
    r(
      "建物",
      fmtBs(oav("建物")),
      fmtBs(av("建物")),
      ...liabilityExtra(4),
    ),
    r(
      "建物附属設備",
      fmtBs(oav("建物附属設備")),
      fmtBs(av("建物附属設備")),
      ...liabilityExtra(5),
    ),
    r(
      "機械装置",
      fmtBs(oav("機械装置")),
      fmtBs(av("機械装置")),
      ...liabilityExtra(6),
    ),
    r(
      "車両運搬具",
      fmtBs(oav("車両運搬具")),
      fmtBs(av("車両運搬具")),
      "貸倒引当金",
      fmtBs(allowanceOpening),
      fmtBs(allowanceClosing),
    ),
    r(
      "工具器具備品",
      fmtBs(oav("工具器具備品")),
      fmtBs(av("工具器具備品")),
      ...liabilityExtra(7),
    ),
    r(
      "土地",
      fmtBs(oav("土地")),
      fmtBs(av("土地")),
      ...liabilityExtra(8),
    ),
    r(
      extraName(0),
      extraOpening(0),
      extraClosing(0),
      ...liabilityExtra(9),
    ),
    r(
      extraName(1),
      extraOpening(1),
      extraClosing(1),
      ...liabilityExtra(10),
    ),
    r(
      extraName(2),
      extraOpening(2),
      extraClosing(2),
      ...liabilityExtra(11),
    ),
    r(
      extraName(3),
      extraOpening(3),
      extraClosing(3),
      ...liabilityExtra(12),
    ),
    r(
      extraName(4),
      extraOpening(4),
      extraClosing(4),
      "事業主借",
      fmtBs(olv("事業主借")),
      fmtBs(lv("事業主借")),
    ),
    r(
      extraName(5),
      extraOpening(5),
      extraClosing(5),
      "元入金",
      fmtBs(olv("元入金")),
      fmtBs(lv("元入金")),
    ),
    r(
      "事業主貸",
      fmtBs(oav("事業主貸")),
      fmtBs(av("事業主貸")),
      "青色申告特別控除前の所得金額",
      null,
      fmtVal(profit),
    ),
    r(
      "合計",
      fmtVal(openingAssetsTotal),
      fmtVal(assetsTotal),
      "合計",
      fmtVal(openingLiabsTotal),
      fmtVal(liabsAndEquityTotalDisplay),
    ),
  ];

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
    nextPeriodOpeningBalanceLines,
    summary,
  };
}
