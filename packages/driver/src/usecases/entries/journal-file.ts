import {
  AppError,
  buildJournalTableRows,
  decodeJournalImportBytes,
  diffJournalTableEntries,
  exportEntriesAsLegacyJson,
  formatJournalTableCsv,
  importEntriesFromLegacyJson,
  importEntriesFromLegacyCsv,
  findDuplicatedEntryNumber,
  hasJournalTableEntryNumberColumn,
  isLegacyJournalCsv,
  isMaterializedVirtualEntry,
  parseJournalTableCsv,
  readJournalTableEntries,
  type EntryRecord,
  type JournalTableChanges,
  type JournalTableMaster,
  type JournalTableProblem,
} from "../../domain/index.js";

export const JOURNAL_FILE_KINDS = ["csv", "json"] as const;
export type JournalFileKind = (typeof JOURNAL_FILE_KINDS)[number];

export type JournalImportPlan =
  | { kind: "replace"; incoming: EntryRecord[]; changes: JournalTableChanges }
  | {
      kind: "problems";
      problems: JournalTableProblem[];
      problemCount: number;
    }
  | { kind: "append"; entries: EntryRecord[]; fromLegacyCsv: boolean }
  | { kind: "add"; entries: EntryRecord[] };

export function planJournalImport(input: {
  fileKind: JournalFileKind;
  bytes: Uint8Array;
  fiscalPeriod: { id: string; startDate: string; endDate: string };
  currentEntries: ReadonlyArray<EntryRecord>;
  master: JournalTableMaster;
}): JournalImportPlan {
  const { fileKind, fiscalPeriod, master } = input;
  const text = decodeJournalImportBytes(input.bytes);
  const fromLegacyCsv = fileKind === "csv" && isLegacyJournalCsv(text);
  if (fileKind === "json" || fromLegacyCsv) {
    return {
      kind: "append",
      entries: fromLegacyCsv
        ? importEntriesFromLegacyCsv({ text, fiscalPeriodId: fiscalPeriod.id })
        : importEntriesFromLegacyJson({
            text,
            fiscalPeriodId: fiscalPeriod.id,
          }),
      fromLegacyCsv,
    };
  }
  const overwrites = hasJournalTableEntryNumberColumn(text);
  if (overwrites) assertEntryNumbersAreUnique(input.currentEntries);
  const read = readJournalTableEntries(parseJournalTableCsv(text), {
    fiscalPeriodId: fiscalPeriod.id,
    startDate: fiscalPeriod.startDate,
    endDate: fiscalPeriod.endDate,
    master,
    storedTexts: new Set(
      input.currentEntries.flatMap((entry) => [
        entry.description,
        ...entry.lines.flatMap((line) =>
          line.partnerName == null ? [] : [line.partnerName],
        ),
      ]),
    ),
  });
  if (!read.ok) {
    return {
      kind: "problems",
      problems: read.problems,
      problemCount: read.problemCount,
    };
  }
  if (!overwrites) return { kind: "add", entries: read.entries };
  return {
    kind: "replace",
    incoming: read.entries,
    changes: diffJournalTableEntries(
      input.currentEntries,
      read.entries,
      master,
    ),
  };
}

export function hasJournalTableChanges(changes: JournalTableChanges): boolean {
  return (
    changes.added.length + changes.changed.length + changes.removed.length > 0
  );
}

export function formatJournalExport(
  fileKind: JournalFileKind,
  entries: ReadonlyArray<EntryRecord>,
  master: JournalTableMaster,
): string {
  return fileKind === "json"
    ? exportEntriesAsLegacyJson(
        entries.filter((entry) => !isMaterializedVirtualEntry(entry)),
      )
    : formatJournalTableCsv(buildJournalTableRows(entries, master));
}

function assertEntryNumbersAreUnique(
  entries: ReadonlyArray<EntryRecord>,
): void {
  const duplicated = findDuplicatedEntryNumber(entries);
  if (duplicated == null) return;
  throw new AppError({
    messageForDeveloper: `journal table: two current entries share the entry number ${duplicated}`,
    messageForUser: `仕訳番号「${duplicated}」の仕訳が 2 件あります。同じ仕訳を 2 回取り込んだときは、片方を消してから取り込んでください`,
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
