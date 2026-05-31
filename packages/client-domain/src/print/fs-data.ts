import { getEntryLines, type EntryRecord } from "../entries/entry-record";
import { parseAmount, parseBusinessRate } from "../shared/parse-utils";

export type FsBsRow = {
  assetLabel: string;
  assetOpening: number | null;
  assetClosing: number | null;
  liabilityLabel: string;
  liabilityOpening: number | null;
  liabilityClosing: number | null;
};

export type FsAggregate = {
  amounts: Record<number, number | null>;
  bsRows: FsBsRow[];
};

export type OpeningBalanceLine = { accountId: string; amount: number };

function add(map: Map<string, number>, name: string, delta: number) {
  if (!name) return;
  map.set(name, (map.get(name) ?? 0) + delta);
}

function sumValues(map: Map<string, number>): number {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
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

  const accountType = new Map<string, string>();

  for (const e of entries) {
    const rate = parseBusinessRate(e.businessRate);
    for (const line of getEntryLines(e)) {
      const amount = Math.round(parseAmount(line.amount) * rate);
      accountType.set(line.accountName, line.accountType);
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
      const t = accountType.get(name);
      if (t === "equity") equityOpeningByName.set(name, line.amount);
      else liabilityOpeningByName.set(name, line.amount);
    }
  }

  function closingMap(opening: Map<string, number>, net: Map<string, number>): Map<string, number> {
    const result = new Map<string, number>();
    for (const [n, v] of opening) result.set(n, v);
    for (const [n, v] of net) result.set(n, (result.get(n) ?? 0) + v);
    return result;
  }
  const assetClosingByName = closingMap(assetOpeningByName, assetNetByName);
  const liabilityClosingByName = closingMap(liabilityOpeningByName, liabilityNetByName);
  const equityClosingByName = closingMap(equityOpeningByName, equityNetByName);

  const revenueTotal = sumValues(revenueByName);
  const costOfSalesTotal = sumValues(costOfSalesByName);
  const expensesTotal = sumValues(expenseByName);
  const grossProfit = revenueTotal - costOfSalesTotal;
  const profit = grossProfit - expensesTotal;

  const expense = (label: string): number | null => {
    const v = expenseByName.get(label) ?? 0;
    return v > 0 ? v : null;
  };
  const cost = (label: string): number | null => {
    const v = costOfSalesByName.get(label) ?? 0;
    return v > 0 ? v : null;
  };
  const purchases = cost("仕入");

  const amounts: Record<number, number | null> = {
    1: revenueTotal !== 0 ? revenueTotal : null,
    2: null,
    3: purchases,
    4: purchases ?? 0,
    5: null,
    6: costOfSalesTotal,
    7: grossProfit,
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
    26: null,
    27: null,
    28: null,
    29: null,
    30: null,
    31: expense("雑費"),
    32: expensesTotal,
    33: profit,
    34: null, 35: null, 36: null, 37: null,
    38: null, 39: null, 40: null, 41: null,
    42: 0,
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
  const lvBoth = (closing: Map<string, number>, label: string, aliases: string[]): number => {
    let v = closing.get(label) ?? 0;
    for (const a of aliases) v += closing.get(a) ?? 0;
    return v;
  };
  const lv = (label: string, ...aliases: string[]): number =>
    lvBoth(liabilityClosingByName, label, aliases) + lvBoth(equityClosingByName, label, aliases);
  const olv = (label: string, ...aliases: string[]): number =>
    lvBoth(liabilityOpeningByName, label, aliases) + lvBoth(equityOpeningByName, label, aliases);

  const fmtBs = (v: number): number | null => (v <= 0 ? null : v);

  const fmtVal = (v: number): number | null => (v === 0 ? null : v);

  const handledAssets = new Set([
    "現金", "当座預金", "普通預金", "定期預金", "その他の預金",
    "受取手形", "売掛金", "有価証券", "棚卸資産", "商品",
    "前払金", "前払費用", "貸付金", "建物", "建物附属設備",
    "機械装置", "車両運搬具", "工具器具備品", "土地", "事業主貸",
  ]);
  const extras = [...assetClosingByName.entries()]
    .filter(([k, v]) => !handledAssets.has(k) && v !== 0);
  const extraName = (i: number) => extras[i]?.[0] ?? "";
  const extraOpening = (i: number): number | null =>
    extras[i] ? fmtBs(oav(extras[i][0])) : null;
  const extraClosing = (i: number): number | null =>
    extras[i] ? fmtBs(extras[i][1]) : null;

  const openingAssetsTotal = sumValues(assetOpeningByName);
  const openingLiabsTotal = sumValues(liabilityOpeningByName) + sumValues(equityOpeningByName);
  const assetsTotal = sumValues(assetClosingByName);

  const liabsAndEquityTotalDisplay =
    sumValues(liabilityClosingByName) + sumValues(equityClosingByName) + profit;

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
    r("現金", fmtBs(oav("現金")), fmtBs(av("現金")), "支払手形", fmtBs(olv("支払手形")), fmtBs(lv("支払手形"))),
    r("当座預金", fmtBs(oav("当座預金")), fmtBs(av("当座預金")), "買掛金", fmtBs(olv("買掛金")), fmtBs(lv("買掛金"))),
    r("定期預金", fmtBs(oav("定期預金")), fmtBs(av("定期預金")), "借入金", fmtBs(olv("借入金", "長期借入金")), fmtBs(lv("借入金", "長期借入金"))),
    r("その他の預金", fmtBs(oav("その他の預金", "普通預金")), fmtBs(av("その他の預金", "普通預金")), "未払金", fmtBs(olv("未払金")), fmtBs(lv("未払金"))),
    r("受取手形", fmtBs(oav("受取手形")), fmtBs(av("受取手形")), "前受金", fmtBs(olv("前受金")), fmtBs(lv("前受金"))),
    r("売掛金", fmtBs(oav("売掛金")), fmtBs(av("売掛金")), "預り金", fmtBs(olv("預り金")), fmtBs(lv("預り金"))),
    r("有価証券", fmtBs(oav("有価証券")), fmtBs(av("有価証券")), "", null, null),
    r("棚卸資産", fmtBs(oav("棚卸資産", "商品")), fmtBs(av("棚卸資産", "商品")), "", null, null),
    r("前払金", fmtBs(oav("前払金", "前払費用")), fmtBs(av("前払金", "前払費用")), "", null, null),
    r("貸付金", fmtBs(oav("貸付金")), fmtBs(av("貸付金")), "", null, null),
    r("建物", fmtBs(oav("建物")), fmtBs(av("建物")), "", null, null),
    r("建物附属設備", fmtBs(oav("建物附属設備")), fmtBs(av("建物附属設備")), "", null, null),
    r("機械装置", fmtBs(oav("機械装置")), fmtBs(av("機械装置")), "", null, null),
    r("車両運搬具", fmtBs(oav("車両運搬具")), fmtBs(av("車両運搬具")), "貸倒引当金", fmtBs(olv("貸倒引当金")), fmtBs(lv("貸倒引当金"))),
    r("工具器具備品", fmtBs(oav("工具器具備品")), fmtBs(av("工具器具備品")), "", null, null),
    r("土地", fmtBs(oav("土地")), fmtBs(av("土地")), "", null, null),
    r(extraName(0), extraOpening(0), extraClosing(0), "", null, null),
    r(extraName(1), extraOpening(1), extraClosing(1), "", null, null),
    r(extraName(2), extraOpening(2), extraClosing(2), "", null, null),
    r(extraName(3), extraOpening(3), extraClosing(3), "", null, null),
    r(extraName(4), extraOpening(4), extraClosing(4), "事業主借", fmtBs(olv("事業主借")), fmtBs(lv("事業主借"))),
    r(extraName(5), extraOpening(5), extraClosing(5), "元入金", fmtBs(olv("元入金")), fmtBs(lv("元入金"))),
    r("事業主貸", fmtBs(oav("事業主貸")), fmtBs(av("事業主貸")), "青色申告特別控除前の所得金額", null, fmtVal(profit)),
    r("合計", fmtVal(openingAssetsTotal), fmtVal(assetsTotal), "合計", fmtVal(openingLiabsTotal), fmtVal(liabsAndEquityTotalDisplay)),
  ];

  return { amounts, bsRows };
}
