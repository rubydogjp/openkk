import type { FiscalPeriodArchiveStatus } from "../shared/models.js";

export type LegacyFiscalPeriodArchiveStatus = "active" | "archived" | "purged";

export function readLegacyFiscalPeriodArchiveStatus(
  stored: LegacyFiscalPeriodArchiveStatus,
): FiscalPeriodArchiveStatus {
  return stored === "purged" ? "purged" : "active";
}
