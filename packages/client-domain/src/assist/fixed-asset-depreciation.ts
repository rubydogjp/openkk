import { parseIsoLocalDate } from "../shared/parse-utils.js";

export type StraightLineDepreciationInput = {
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  asOf: Date;
};

export type DepreciationSnapshot = {
  progress: number;
  currentBookValue: number;
  accumulated: number;
  annualDepreciation: number;
  elapsedMonths: number;
  totalMonths: number;
  remainingMonths: number;
  periodLabel: string;
  remainingLabel: string;
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
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  periodStartDate: Date;
  asOf: Date;
};

export function computePeriodDepreciation(
  input: PeriodDepreciationInput,
): number {
  const base = {
    acquisitionDate: input.acquisitionDate,
    acquisitionCost: input.acquisitionCost,
    usefulLife: input.usefulLife,
  };
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
    Number(
      (BigInt(depreciableAmount) * BigInt(elapsedMonths)) / BigInt(totalMonths),
    ),
  );
  const currentBookValue = Math.max(cost > 0 ? 1 : 0, cost - accumulated);

  const annualWindowEnd = Math.min(totalMonths, elapsedMonths + 12);
  const annualDepreciation = Math.min(
    depreciableAmount - accumulated,
    Number(
      (BigInt(depreciableAmount) * BigInt(annualWindowEnd)) / BigInt(totalMonths),
    ) -
      accumulated,
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
