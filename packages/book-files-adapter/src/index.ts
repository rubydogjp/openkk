import {
  BookImportChangedError,
  type BookImportExpectation,
  type BooksDbAdapter,
  type InspectedBookPeriod,
} from "@rubydogjp/openkk-books-db-adapter";
import {
  OpenkkBookFileError,
  type OpenkkBookFilesPort,
  type OpenkkBookFileSaveResult,
  type OpenkkBookFileState,
  type OpenkkBookImportItem,
  type PlatformKeyValueStorage,
} from "@rubydogjp/openkk-client-ports";
import { DocumentFileFormatError } from "@rubydogjp/openkk-document-db-adapter";

import { bookImportCase } from "./import-case.js";
import { createBookSaveRecords } from "./save-records.js";

export { bookImportCase } from "./import-case.js";

export const BOOK_SAVE_REMINDER_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export type BookFilesAdapterOptions = {
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
  userId: string;
  storage: PlatformKeyValueStorage;
  now(): number;
  fileNameOf(fiscalPeriodName: string): string;
  deliver(
    bytes: Uint8Array,
    fileName: string,
  ): Promise<OpenkkBookFileSaveResult>;
};

export type BookFilesAdapter = OpenkkBookFilesPort & {
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
  if (error instanceof DocumentFileFormatError) {
    return new OpenkkBookFileError(
      error.problem === "newer_schema" ? "newer_version" : "not_a_book",
    );
  }
  if (error instanceof BookImportChangedError) {
    return new OpenkkBookFileError("books_changed");
  }
  return error;
}

export function createBookFilesAdapter(
  options: BookFilesAdapterOptions,
): BookFilesAdapter {
  const { books } = options;
  const records = createBookSaveRecords(options.storage);
  const listeners = new Set<() => void>();
  const states = new Map<string, OpenkkBookFileState>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  books.subscribe(notify);

  function itemOf(period: InspectedBookPeriod): OpenkkBookImportItem {
    const { relation } = period;
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

  return {
    unreadableBookCount: books.unreadableBooks.length,
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
          if (incoming.length === 0) return [];
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
          await books.flush();
          notify();
          return imported.map((fiscalPeriod) => fiscalPeriod.id);
        },
      };
    },
    forgetFiscalPeriod(fiscalPeriodId) {
      records.forget(fiscalPeriodId);
      states.delete(fiscalPeriodId);
    },
  };
}
