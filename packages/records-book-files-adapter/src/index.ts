import {
  BookFileFormatError,
  createBookDbAdapter,
  createBookFileBytes,
  type DbSnapshot,
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

export type RecordsBookFilesAdapterOptions = {
  backend: OpenkkBackendPort;
  bookOwnerUserId: string;
  now(): Date;
  fileNameOf(fiscalPeriodName: string): string;
  deliver(
    bytes: Uint8Array,
    fileName: string,
  ): Promise<OpenkkBookFileSaveResult>;
};

type BookPeriod = {
  fiscalPeriod: DbSnapshot["fiscalPeriods"][number];
  entries: DbSnapshot["entries"];
  fixedAssets: DbSnapshot["fixedAssets"];
};

type DateRange = { startDate: string; endDate: string };

function rangesOverlap(left: DateRange, right: DateRange): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

async function readBookPeriods(bytes: Uint8Array): Promise<BookPeriod[]> {
  let book;
  try {
    book = await createBookDbAdapter(bytes);
  } catch (error) {
    if (error instanceof BookFileFormatError) {
      throw new OpenkkBookFileError(
        error.problem === "newer_schema" ? "newer_version" : "not_a_book",
      );
    }
    throw error;
  }
  try {
    const periods: BookPeriod[] = [];
    for (const fiscalPeriodId of book.listFiscalPeriodIds()) {
      const fiscalPeriod = await book.db.fiscalPeriods.getById(fiscalPeriodId);
      if (fiscalPeriod == null) continue;
      periods.push({
        fiscalPeriod,
        entries: await book.db.entries.getAll(fiscalPeriodId),
        fixedAssets: await book.db.fixedAssets.getAll(fiscalPeriodId),
      });
    }
    return periods;
  } finally {
    book.close();
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
      const bytes = await createBookFileBytes({
        fiscalPeriods: [
          {
            ...fiscalPeriod,
            userId: bookOwnerUserId,
            archiveStatus: "active",
            archivedAt: null,
          },
        ],
        entries: entries.map((entry) => ({
          ...entry,
          userId: bookOwnerUserId,
        })),
        fixedAssets: fixedAssets.map((asset) => ({
          ...asset,
          userId: bookOwnerUserId,
        })),
      });
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
