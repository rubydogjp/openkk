// 定額法（straight-line）の減価償却計算。
// 固定資産の「真実」は取得価額・取得日・耐用年数で、簿価・進捗・当期償却費などの
// 表示値はすべてここから導出する（保存された preview 値には依存しない）。

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

function monthsBetween(
  start: { year: number; month: number; day: number },
  asOf: Date,
): number {
  return (
    (asOf.getFullYear() - start.year) * 12 +
    (asOf.getMonth() + 1 - start.month) -
    (asOf.getDate() < start.day ? 1 : 0)
  );
}

export function computeStraightLineDepreciation(
  input: StraightLineDepreciationInput,
): DepreciationSnapshot {
  const start = {
    year: Number(input.acquisitionDate.slice(0, 4)),
    month: Number(input.acquisitionDate.slice(5, 7)),
    day: Number(input.acquisitionDate.slice(8, 10)),
  };
  const cost = Math.max(0, Math.round(input.acquisitionCost));
  // 耐用年数は最低 1 年。月数上限 1200（=100 年）で異常値を防ぐ。
  const usefulLifeYears = Math.max(1, Math.floor(input.usefulLife) || 1);
  const totalMonths = Math.min(1200, usefulLifeYears * 12);

  const hasValidStart =
    start.year > 0 &&
    start.month >= 1 &&
    start.month <= 12 &&
    start.day >= 1 &&
    start.day <= 31;
  const rawElapsed = hasValidStart ? monthsBetween(start, input.asOf) : 0;
  const elapsedMonths = Number.isFinite(rawElapsed)
    ? Math.max(0, Math.min(totalMonths, rawElapsed))
    : 0;
  const progress = totalMonths === 0 ? 1 : elapsedMonths / totalMonths;

  const accumulated = Math.min(cost, Math.round(cost * progress));
  const currentBookValue = Math.max(0, cost - accumulated);
  const annualDepreciation = Math.min(cost, Math.round(cost / usefulLifeYears));
  const remainingMonths = totalMonths - elapsedMonths;

  return {
    progress,
    currentBookValue,
    accumulated,
    annualDepreciation,
    elapsedMonths,
    totalMonths,
    remainingMonths,
    periodLabel: hasValidStart ? `${start.year}年${start.month}月〜` : "",
    remainingLabel: remainingMonths > 0 ? `あと${remainingMonths}ヶ月` : "償却済み",
  };
}
