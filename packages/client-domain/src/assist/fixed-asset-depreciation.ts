// 定額法（straight-line）の減価償却計算。
// 固定資産の「真実」は取得価額・取得日・耐用年数で、簿価・進捗・当期償却費などの
// 表示値はすべてここから導出する（保存された preview 値には依存しない）。

import { parseIsoLocalDate } from "../shared/parse-utils";

export type StraightLineDepreciationInput = {
  acquisitionDate: string; // "YYYY-MM-DD"
  acquisitionCost: number;
  usefulLife: number; // 耐用年数（年）
  asOf: Date; // 評価基準日（期末日 or 今日、売却済みなら処分日）
};

export type DepreciationSnapshot = {
  progress: number; // 0..1（償却進捗）
  currentBookValue: number; // 現在簿価（>= 0）
  accumulated: number; // 償却累計額
  annualDepreciation: number; // 1 年分の償却費（当期計上額の目安）
  elapsedMonths: number;
  totalMonths: number;
  remainingMonths: number;
  periodLabel: string; // "YYYY年M月〜"
  remainingLabel: string; // "あとNヶ月" / "償却済み"
};

function monthsInService(
  start: { year: number; month: number },
  asOf: Date,
): number {
  const acquisitionIndex = start.year * 12 + (start.month - 1);
  const asOfIndex = asOf.getFullYear() * 12 + asOf.getMonth();
  return asOfIndex - acquisitionIndex + 1;
}

export type PeriodDepreciationInput = {
  acquisitionDate: string; // "YYYY-MM-DD"
  acquisitionCost: number;
  usefulLife: number;
  periodStartDate: Date; // 会計期間の開始日
  asOf: Date; // 当期の評価終端（期末日。期中に処分した場合は処分日）
};

export function computePeriodDepreciation(
  input: PeriodDepreciationInput,
): number {
  const base = {
    acquisitionDate: input.acquisitionDate,
    acquisitionCost: input.acquisitionCost,
    usefulLife: input.usefulLife,
  };
  // 期首より前（前月末まで）の累計償却を控除して、当期に属する月数分のみを取り出す。
  const dayBeforePeriod = new Date(input.periodStartDate);
  dayBeforePeriod.setDate(dayBeforePeriod.getDate() - 1);
  const before = computeStraightLineDepreciation({
    ...base,
    asOf: dayBeforePeriod,
  }).accumulated;
  const through = computeStraightLineDepreciation({
    ...base,
    asOf: input.asOf,
  }).accumulated;
  return Math.max(0, through - before);
}

export function computeStraightLineDepreciation(
  input: StraightLineDepreciationInput,
): DepreciationSnapshot {
  const startDate = parseIsoLocalDate(input.acquisitionDate);
  const start =
    startDate == null
      ? null
      : {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          day: startDate.getDate(),
        };
  const cost = Math.max(0, Math.round(input.acquisitionCost));
  // 耐用年数は最低 1 年。月数上限 1200（=100 年）で異常値を防ぐ。
  const usefulLifeYears = Math.max(1, Math.floor(input.usefulLife) || 1);
  const totalMonths = Math.min(1200, usefulLifeYears * 12);

  const rawElapsed = start == null ? 0 : monthsInService(start, input.asOf);
  const elapsedMonths = Number.isFinite(rawElapsed)
    ? Math.max(0, Math.min(totalMonths, rawElapsed))
    : 0;
  const progress = totalMonths === 0 ? 1 : elapsedMonths / totalMonths;

  const depreciableAmount = Math.max(0, cost - (cost > 0 ? 1 : 0));
  const accumulated = Math.min(
    depreciableAmount,
    Math.floor(depreciableAmount * progress),
  );
  const currentBookValue = Math.max(cost > 0 ? 1 : 0, cost - accumulated);

  const annualDepreciation = Math.min(
    depreciableAmount - accumulated,
    Math.floor(depreciableAmount / usefulLifeYears),
  );
  const remainingMonths = totalMonths - elapsedMonths;

  return {
    progress,
    currentBookValue,
    accumulated,
    annualDepreciation,
    elapsedMonths,
    totalMonths,
    remainingMonths,
    periodLabel: start == null ? "" : `${start.year}年${start.month}月〜`,
    remainingLabel:
      remainingMonths > 0 ? `あと${remainingMonths}ヶ月` : "償却済み",
  };
}
