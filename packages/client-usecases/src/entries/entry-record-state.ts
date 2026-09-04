import type { EntryRecord } from "@rubydogjp/openkk-client-domain";

export function replaceFiscalPeriodEntryRecords(
  current: EntryRecord[],
  fiscalPeriodId: string | null,
  nextRecords: EntryRecord[],
): EntryRecord[] {
  if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return [];
  return [
    ...current.filter((record) => record.fiscalPeriodId !== fiscalPeriodId),
    ...nextRecords,
  ];
}

export function removeEntryRecord(
  current: EntryRecord[],
  entryId: string,
): EntryRecord[] {
  return current.filter((record) => record.id !== entryId);
}

export function upsertEntryRecord(
  current: EntryRecord[],
  next: EntryRecord,
): EntryRecord[] {
  return [...current.filter((record) => record.id !== next.id), next];
}

export function earliestEntryDate(
  entries: ReadonlyArray<EntryRecord>,
): string | null {
  let earliest: string | null = null;
  for (const entry of entries) {
    if (earliest == null || entry.date < earliest) earliest = entry.date;
  }
  return earliest;
}
