import type { EntryRecord } from "@rubydogjp/openkk-client-domain";

export function replaceFiscalPeriodEntryRecords(
  current: EntryRecord[],
  fiscalPeriodId: string,
  nextRecords: EntryRecord[],
): EntryRecord[] {
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
