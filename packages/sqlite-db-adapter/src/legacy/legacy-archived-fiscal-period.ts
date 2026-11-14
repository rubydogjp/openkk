import type { FiscalPeriodDbArchiveStatus } from "@rubydogjp/openkk-engine";

export const LEGACY_STORED_ARCHIVE_STATUSES = [
  "active",
  "archived",
  "purged",
] as const;

export type LegacyStoredArchiveStatus =
  (typeof LEGACY_STORED_ARCHIVE_STATUSES)[number];

export type LegacyStoredArchiveState = {
  archiveStatus: LegacyStoredArchiveStatus;
  archivedAt: string | null;
};

export function readLegacyStoredArchiveState(
  stored: LegacyStoredArchiveState,
): {
  archiveStatus: FiscalPeriodDbArchiveStatus;
  archivedAt: string | null;
} {
  if (stored.archiveStatus === "archived") {
    return { archiveStatus: "active", archivedAt: null };
  }
  return { archiveStatus: stored.archiveStatus, archivedAt: stored.archivedAt };
}
