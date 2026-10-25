export function closingYear(fiscalPeriod: { endDate: string }): number {
  return Number(fiscalPeriod.endDate.slice(0, 4));
}
