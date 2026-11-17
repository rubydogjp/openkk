import {
  assertBookFileSize,
  BookFileFormatError,
  createBookDbAdapter,
  createBookFileBytes,
  isBookContentError,
  readBookRecords,
  type BookPeriodRecords,
} from "@rubydogjp/openkk-book-db-adapter";
import {
  archiveClosingRecords,
  buildFiscalPeriodArchivePayload,
  OpenkkBookFileError,
  type OpenkkBackendPort,
  type OpenkkBookFileSaveResult,
  type OpenkkBookFilesPort,
  type OpenkkBookImportItem,
} from "@rubydogjp/openkk-driver";

export const PORTABLE_BOOK_OWNER_USER_ID = "openkk-original-user";

export function keepFiscalPeriodIdInBook(fiscalPeriodId: string): string {
  return fiscalPeriodId;
}

export function newFiscalPeriodIdInBook(): string {
  return `fp_${crypto.randomUUID()}`;
}

export type RecordsBookFilesAdapterOptions = {
  backend: OpenkkBackendPort;
  bookOwnerUserId: string;
  fiscalPeriodIdInBook(fiscalPeriodId: string): string;
  now(): Date;
  fileNameOf(fiscalPeriodName: string): string;
  deliver(
    bytes: Uint8Array,
    fileName: string,
  ): Promise<OpenkkBookFileSaveResult>;
};

type DateRange = { startDate: string; endDate: string };

function rangesOverlap(left: DateRange, right: DateRange): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

function bookFileError(error: unknown): unknown {
  if (error instanceof BookFileFormatError) {
    return new OpenkkBookFileError(
      error.problem === "newer_schema" ? "newer_version" : "not_a_book",
    );
  }
  return isBookContentError(error)
    ? new OpenkkBookFileError("not_a_book")
    : error;
}

async function readBookPeriods(
  bytes: Uint8Array,
): Promise<BookPeriodRecords[]> {
  try {
    assertBookFileSize(bytes);
    const book = await createBookDbAdapter(bytes);
    try {
      return await readBookRecords(book);
    } finally {
      book.close();
    }
  } catch (error) {
    throw bookFileError(error);
  }
}

export function createRecordsBookFilesAdapter(
  options: RecordsBookFilesAdapterOptions,
): OpenkkBookFilesPort {
  const { backend, bookOwnerUserId } = options;

  return {
    saveTracking: null,
    reloadsAppAfterImport: false,
    fileNameOf: options.fileNameOf,
    async save(fiscalPeriodId) {
      const fiscalPeriod = (await backend.fiscalPeriods.getAll()).find(
        (candidate) => candidate.id === fiscalPeriodId,
      );
      if (fiscalPeriod == null) {
        throw new Error(`fiscal period not found: ${fiscalPeriodId}`);
      }
      const [entries, fixedAssets] = await Promise.all([
        backend.entries.getAll(fiscalPeriodId),
        backend.fixedAssets.getAll(fiscalPeriodId),
      ]);
      const idInBook = options.fiscalPeriodIdInBook(fiscalPeriodId);
      const bytes = await createBookFileBytes(
        {
          fiscalPeriods: [
            {
              ...fiscalPeriod,
              id: idInBook,
              userId: bookOwnerUserId,
              archiveStatus: "active",
              archivedAt: null,
            },
          ],
          entries: entries.map((entry) => ({
            ...entry,
            fiscalPeriodId: idInBook,
            userId: bookOwnerUserId,
          })),
          fixedAssets: fixedAssets.map((asset) => ({
            ...asset,
            fiscalPeriodId: idInBook,
            userId: bookOwnerUserId,
          })),
        },
        null,
      );
      return options.deliver(bytes, options.fileNameOf(fiscalPeriod.name));
    },
    async inspect(bytes) {
      const periods = await readBookPeriods(bytes);
      if (periods.length === 0) {
        throw new OpenkkBookFileError("no_fiscal_period");
      }
      const existing = (await backend.fiscalPeriods.getAll()).filter(
        (period) => period.archiveStatus !== "purged",
      );
      const items = periods.map(({ fiscalPeriod }): OpenkkBookImportItem => {
        const overlapping =
          existing.find((period) => rangesOverlap(period, fiscalPeriod)) ??
          null;
        return {
          fiscalPeriodId: fiscalPeriod.id,
          fiscalPeriodName: fiscalPeriod.name,
          case: overlapping == null ? "new" : "overlapping",
          existingFiscalPeriodId: overlapping?.id ?? null,
          existingFiscalPeriodName: overlapping?.name ?? null,
        };
      });
      return {
        items,
        async apply() {
          if (items.some((item) => item.case === "overlapping")) {
            throw new OpenkkBookFileError("books_changed");
          }
          const importedIds: string[] = [];
          for (const period of periods) {
            const imported = await backend.fiscalPeriods.importArchived(
              buildFiscalPeriodArchivePayload({
                createdAt: options.now().toISOString(),
                fiscalPeriod: {
                  ...period.fiscalPeriod,
                  archiveStatus: "archived",
                },
                entries: period.entries.map((entry) => ({ ...entry })),
                fixedAssets: period.fixedAssets.map((asset) => ({ ...asset })),
                closings: archiveClosingRecords(period.fiscalPeriod),
              }),
            );
            importedIds.push(imported.id);
          }
          return importedIds;
        },
      };
    },
  };
}
