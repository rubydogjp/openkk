import {
  BookImportChangedError,
  type BookImportExpectation,
  type BooksDbAdapter,
  type InspectedBookPeriod,
} from "@rubydogjp/openkk-books-db-adapter";
import {
  OpenkkBookFileError,
  type OpenkkBookFilesPort,
  OpenkkBookSaveTracking,
  type OpenkkBookFileSaveResult,
  type OpenkkBookFileState,
  type OpenkkBookImportItem,
  type OpenkkBookImportResult,
  type OpenkkFiscalPeriodLabel,
  type OpenkkLegacyBookChanges,
  type PlatformKeyValueStorage,
} from "@rubydogjp/openkk-driver";
import { BookFileFormatError } from "@rubydogjp/openkk-book-db-adapter";

import { bookImportCase } from "./import-case.js";
import { createBookSaveRecords } from "./save-records.js";

export { bookImportCase } from "./import-case.js";

export const BOOK_SAVE_REMINDER_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export type LegacyBookChangedPeriod = {
  fiscalPeriodId: string;
  label: OpenkkFiscalPeriodLabel;
  bytes: Uint8Array;
  movedLastChangedAt: number | null;
};

export type LegacyBookChangeSet = {
  changed: readonly LegacyBookChangedPeriod[];
  removed: readonly OpenkkFiscalPeriodLabel[];
  accept(movedLastChangedAt: ReadonlyMap<string, number>): void;
};

export type LegacyBookWatch = {
  detectChanges(): Promise<LegacyBookChangeSet | null>;
};

export type LocalBookFilesAdapterOptions = {
  books: Pick<
    BooksDbAdapter,
    | "exportBook"
    | "flush"
    | "importBookFile"
    | "inspectBookFile"
    | "lastChangedAt"
    | "storageStatus"
    | "subscribe"
    | "unreadableBooks"
  >;
  legacyUnmovedFiscalPeriods: readonly OpenkkFiscalPeriodLabel[];
  legacyMergedFiscalPeriods: readonly OpenkkFiscalPeriodLabel[];
  legacyBookWatch: LegacyBookWatch | null;
  userId: string;
  storage: PlatformKeyValueStorage;
  now(): number;
  fileNameOf(fiscalPeriodName: string): string;
  deliver(
    bytes: Uint8Array,
    fileName: string,
  ): Promise<OpenkkBookFileSaveResult>;
};

export type LocalBookFilesAdapter = OpenkkBookFilesPort & {
  readonly saveTracking: OpenkkBookSaveTracking;
  forgetFiscalPeriod(fiscalPeriodId: string): void;
};

function sameState(left: OpenkkBookFileState, right: OpenkkBookFileState) {
  return (
    left.fileName === right.fileName &&
    left.hasUnsavedChanges === right.hasUnsavedChanges &&
    left.lastSavedAt === right.lastSavedAt &&
    left.reminderDue === right.reminderDue
  );
}

function expectationOf(period: InspectedBookPeriod): BookImportExpectation {
  const { relation } = period;
  const replaces =
    relation.kind === "same_period" || relation.kind === "same_dates";
  return {
    fiscalPeriodId: period.fiscalPeriod.id,
    relation: relation.kind,
    existingFiscalPeriodId: replaces ? relation.existing.id : null,
    existingLastChangedAt: replaces ? relation.existingLastChangedAt : null,
  };
}

function bookFileError(error: unknown): unknown {
  if (error instanceof BookFileFormatError) {
    return new OpenkkBookFileError(
      error.problem === "newer_schema" ? "newer_version" : "not_a_book",
    );
  }
  if (error instanceof BookImportChangedError) {
    return new OpenkkBookFileError("books_changed");
  }
  return error;
}

export function createLocalBookFilesAdapter(
  options: LocalBookFilesAdapterOptions,
): LocalBookFilesAdapter {
  const { books } = options;
  const records = createBookSaveRecords(options.storage);
  const listeners = new Set<() => void>();
  const states = new Map<string, OpenkkBookFileState>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  books.subscribe(notify);

  let legacyChangeSet: LegacyBookChangeSet | null = null;
  let legacyChanges: OpenkkLegacyBookChanges | null = null;
  options.legacyBookWatch?.detectChanges().then(
    (changeSet) => {
      if (changeSet == null) return;
      legacyChangeSet = changeSet;
      legacyChanges = {
        changedFiscalPeriods: changeSet.changed.map((period) => period.label),
        removedFiscalPeriods: changeSet.removed,
      };
      notify();
    },
    (error: unknown) => {
      console.error(
        "[openkk] the previous version's data could not be checked:",
        error,
      );
    },
  );

  function changedInAppSinceMoved(period: LegacyBookChangedPeriod): boolean {
    const current = books.lastChangedAt(period.fiscalPeriodId);
    return current != null && current !== period.movedLastChangedAt;
  }

  async function moveLegacyPeriod(
    period: LegacyBookChangedPeriod,
  ): Promise<string> {
    let inspected: InspectedBookPeriod[];
    try {
      inspected = await books.inspectBookFile(period.bytes, options.userId);
    } catch (error) {
      throw bookFileError(error);
    }
    const target = inspected.find(
      (candidate) => candidate.fiscalPeriod.id === period.fiscalPeriodId,
    );
    if (target == null) throw new OpenkkBookFileError("no_fiscal_period");
    if (
      target.relation.kind !== "new" &&
      target.relation.kind !== "same_period"
    ) {
      throw new OpenkkBookFileError("books_changed");
    }
    try {
      await books.importBookFile(period.bytes, options.userId, [
        expectationOf(target),
      ]);
    } catch (error) {
      throw bookFileError(error);
    }
    return period.fiscalPeriodId;
  }

  async function moveLegacyBookChanges(): Promise<OpenkkBookImportResult> {
    const changeSet = legacyChangeSet;
    if (changeSet == null) {
      return { fiscalPeriodIds: [], allBooksStored: true };
    }
    const fiscalPeriodIds: string[] = [];
    for (const period of changeSet.changed) {
      fiscalPeriodIds.push(await moveLegacyPeriod(period));
    }
    const movedLastChangedAt = new Map<string, number>();
    for (const fiscalPeriodId of fiscalPeriodIds) {
      const lastChangedAt = books.lastChangedAt(fiscalPeriodId);
      if (lastChangedAt != null) {
        movedLastChangedAt.set(fiscalPeriodId, lastChangedAt);
      }
    }
    try {
      changeSet.accept(movedLastChangedAt);
    } catch (error) {
      console.error(
        "[openkk] the moved data of the previous version could not be remembered:",
        error,
      );
    }
    legacyChangeSet = null;
    legacyChanges = null;
    const allBooksStored = await books.flush().then(
      () => true,
      () => false,
    );
    notify();
    return { fiscalPeriodIds, allBooksStored };
  }

  function itemOf(period: InspectedBookPeriod): OpenkkBookImportItem {
    const { relation } = period;
    if (relation.kind === "unreadable_book") {
      return {
        fiscalPeriodId: period.fiscalPeriod.id,
        fiscalPeriodName: period.fiscalPeriod.name,
        case: bookImportCase(period, null),
        existingFiscalPeriodId: null,
        existingFiscalPeriodName: relation.existing.name,
      };
    }
    const existing =
      relation.kind === "same_period" || relation.kind === "same_dates"
        ? relation.existing
        : relation.kind === "overlapping"
          ? (relation.existing[0] ?? null)
          : null;
    return {
      fiscalPeriodId: period.fiscalPeriod.id,
      fiscalPeriodName: period.fiscalPeriod.name,
      case: bookImportCase(
        period,
        relation.kind === "same_period"
          ? (records.read(relation.existing.id)?.lastChangedAt ?? null)
          : null,
      ),
      existingFiscalPeriodId: existing?.id ?? null,
      existingFiscalPeriodName: existing?.name ?? null,
    };
  }

  const saveTracking: OpenkkBookSaveTracking = {
    unreadableFiscalPeriods: books.unreadableBooks.map(
      ({ fiscalPeriod }) => fiscalPeriod,
    ),
    legacyUnmovedFiscalPeriods: options.legacyUnmovedFiscalPeriods,
    legacyMergedFiscalPeriods: options.legacyMergedFiscalPeriods,
    getLegacyBookChanges: () => legacyChanges,
    legacyChangesOverwritingApp: () =>
      (legacyChangeSet?.changed ?? [])
        .filter(changedInAppSinceMoved)
        .map((period) => period.label),
    moveLegacyBookChanges,
    getStorageStatus: () => books.storageStatus(),
    getState(fiscalPeriod) {
      const fiscalPeriodId = fiscalPeriod.id;
      const lastChangedAt = books.lastChangedAt(fiscalPeriodId);
      if (lastChangedAt == null) return null;
      const record = records.read(fiscalPeriodId);
      const hasUnsavedChanges =
        record == null || record.lastChangedAt !== lastChangedAt;
      const next: OpenkkBookFileState = {
        fileName: options.fileNameOf(fiscalPeriod.name),
        hasUnsavedChanges,
        lastSavedAt: record?.savedAt ?? null,
        reminderDue:
          hasUnsavedChanges &&
          options.now() -
            (record?.savedAt ?? Date.parse(fiscalPeriod.createdAt)) >=
            BOOK_SAVE_REMINDER_INTERVAL_MS,
      };
      const previous = states.get(fiscalPeriodId);
      if (previous != null && sameState(previous, next)) return previous;
      states.set(fiscalPeriodId, next);
      return next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async retryStorage() {
      await books.flush();
    },
  };

  return {
    saveTracking,
    reloadsAppAfterImport: true,
    fileNameOf: options.fileNameOf,
    async save(fiscalPeriodId) {
      const exported = await books.exportBook(fiscalPeriodId);
      if (exported == null) {
        throw new Error(`fiscal period has no book: ${fiscalPeriodId}`);
      }
      const result = await options.deliver(
        exported.bytes,
        options.fileNameOf(exported.fiscalPeriod.name),
      );
      if (result === "cancelled") return "cancelled";
      records.write(fiscalPeriodId, {
        savedAt: options.now(),
        lastChangedAt: exported.lastChangedAt,
      });
      notify();
      return "saved";
    },
    async inspect(bytes) {
      let inspected: InspectedBookPeriod[];
      try {
        inspected = await books.inspectBookFile(bytes, options.userId);
      } catch (error) {
        throw bookFileError(error);
      }
      if (inspected.length === 0) {
        throw new OpenkkBookFileError("no_fiscal_period");
      }
      const items = inspected.map(itemOf);
      return {
        items,
        async apply() {
          if (items.some((item) => item.case === "overlapping")) {
            throw new OpenkkBookFileError("books_changed");
          }
          const incoming = inspected.filter(
            (_, index) => items[index]!.case !== "same",
          );
          if (incoming.length === 0) {
            return { fiscalPeriodIds: [], allBooksStored: true };
          }
          let imported;
          try {
            imported = await books.importBookFile(
              bytes,
              options.userId,
              incoming.map(expectationOf),
            );
          } catch (error) {
            throw bookFileError(error);
          }
          const savedAt = options.now();
          for (const fiscalPeriod of imported) {
            const lastChangedAt = books.lastChangedAt(fiscalPeriod.id);
            if (lastChangedAt == null) continue;
            records.write(fiscalPeriod.id, { savedAt, lastChangedAt });
          }
          const allBooksStored = await books.flush().then(
            () => true,
            () => false,
          );
          notify();
          return {
            fiscalPeriodIds: imported.map((fiscalPeriod) => fiscalPeriod.id),
            allBooksStored,
          };
        },
      };
    },
    forgetFiscalPeriod(fiscalPeriodId) {
      records.forget(fiscalPeriodId);
      states.delete(fiscalPeriodId);
    },
  };
}
