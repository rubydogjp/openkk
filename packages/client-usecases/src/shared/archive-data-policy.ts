export type ArchiveDataPeriod = {
  id: string;
  archiveStatus: "active" | "archived";
  archiveDataAvailable: boolean;
};

export function isSelectedFiscalPeriodDataPurged(
  periods: ReadonlyArray<ArchiveDataPeriod>,
  currentFiscalPeriodId: string | null,
): boolean {
  return periods.some(
    (period) =>
      period.id === currentFiscalPeriodId &&
      period.archiveStatus === "archived" &&
      period.archiveDataAvailable === false,
  );
}
