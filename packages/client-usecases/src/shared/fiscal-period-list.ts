import type { FiscalPeriod } from "@rubydogjp/openkk-client-domain";
import type { FiscalPeriodApiRecord } from "@rubydogjp/openkk-client-ports";

export function mapRemoteFiscalPeriod(period: FiscalPeriodApiRecord): FiscalPeriod {
  return {
    id: period.id,
    userId: period.userId,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    phase: period.phase,
    archiveStatus: period.archiveStatus,
    archivedAt: period.archivedAt,
    openingBalancesCompleted: period.openingBalancesCompleted,
    documentsReceivedCompleted: period.documentsReceivedCompleted,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
    opening: {
      openingBalanceLines: period.opening.openingBalanceLines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        amount: line.amount,
      })),
      openingJournals: period.opening.openingJournals.map((journal) => ({
        id: journal.id,
        date: journal.date,
        description: journal.description,
        businessRate: journal.businessRate,
        lines: journal.lines.map((line) => ({
          id: line.id,
          side: line.side,
          bookAccountId: line.bookAccountId,
          amount: line.amount,
          partnerName: line.partnerName,
          taxCategoryId: line.taxCategoryId,
          businessCategoryId: line.businessCategoryId,
        })),
      })),
    },
  };
}

export function applyFiscalPeriodUpdate(
  current: FiscalPeriod[],
  patched: FiscalPeriodApiRecord,
): FiscalPeriod[] {
  const mapped = mapRemoteFiscalPeriod(patched);
  const index = current.findIndex((period) => period.id === patched.id);
  if (index < 0) return [...current, mapped];
  return current.flatMap((period, currentIndex) => {
    if (period.id !== patched.id) return [period];
    return currentIndex === index ? [mapped] : [];
  });
}
