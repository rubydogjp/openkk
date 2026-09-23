import type { FiscalPeriodArchiveStatus } from "@rubydogjp/openkk-client-domain";

export function isSelectedFiscalPeriodDataPurged(
  periods: ReadonlyArray<{ id: string; archiveStatus: FiscalPeriodArchiveStatus }>,
  currentFiscalPeriodId: string | null,
): boolean {
  return periods.some(
    (period) =>
      period.id === currentFiscalPeriodId && period.archiveStatus === "purged",
  );
}
