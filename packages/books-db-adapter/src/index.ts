import {
  createDocumentDbAdapter,
  type DocumentDbAdapter,
} from "@rubydogjp/openkk-book-db-adapter";
import {
  assertFiscalPeriodCanCarryOver,
  assertNoOverlappingActiveFiscalPeriod,
  serverNotFoundError,
  type EntryDbRecord,
  type FiscalPeriodArchiveDbImportInput,
  type FiscalPeriodDbRecord,
  type FixedAssetDbRecord,
  type OpenkkDbPort,
} from "@rubydogjp/openkk-engine";
import {
  assertDbCarryoverTargetAllowed,
  createMasterDataDb,
} from "@rubydogjp/openkk-sqlite-db-adapter";

import { splitBookFile, type BookFilePeriod } from "./book-file.js";
import {
  createBookSaver,
  type BookSaver,
  type BookSaveStatus,
} from "./book-saver.js";
import type { BookStore } from "./book-store.js";
import { createOperationQueue, runThroughQueue } from "./operation-queue.js";

export {
  BookSplitMismatchError,
  readStoredFiscalPeriodIds,
  splitBookFile,
} from "./book-file.js";
export type { BookFilePeriod } from "./book-file.js";
export type { BookSaveStatus } from "./book-saver.js";
export { createMemoryBookStore, type BookStore } from "./book-store.js";

export const BOOK_FILE_EXTENSION = ".openkk";

export type UnreadableBook = { name: string; error: unknown };

export type BookFileRelation =
  | { kind: "new" }
  | {
      kind: "same_period";
      existing: FiscalPeriodDbRecord;
      existingLastChangedAt: number;
    }
  | {
      kind: "same_dates";
      existing: FiscalPeriodDbRecord;
      existingLastChangedAt: number;
    }
  | { kind: "overlapping"; existing: FiscalPeriodDbRecord[] };

export type InspectedBookPeriod = {
  fiscalPeriod: FiscalPeriodDbRecord;
  lastChangedAt: number | null;
  relation: BookFileRelation;
};

export type BookImportExpectation = {
  fiscalPeriodId: string;
  relation: BookFileRelation["kind"];
  existingFiscalPeriodId: string | null;
  existingLastChangedAt: number | null;
};

export class BookImportChangedError extends Error {
  constructor(readonly fiscalPeriodId: string) {
    super(`the books changed after the file was inspected: ${fiscalPeriodId}`);
    this.name = "BookImportChangedError";
  }
}

export type ExportedBook = {
  fiscalPeriod: FiscalPeriodDbRecord;
  lastChangedAt: number;
  bytes: Uint8Array;
};

export type BooksDbAdapter = {
  db: OpenkkDbPort;
  unreadableBooks: readonly UnreadableBook[];
  storageStatus(): BookSaveStatus;
  subscribe(listener: () => void): () => void;
  flush(): Promise<void>;
  lastChangedAt(fiscalPeriodId: string): number | null;
  exportBook(fiscalPeriodId: string): Promise<ExportedBook | null>;
  inspectBookFile(
    bytes: Uint8Array,
    userId: string,
  ): Promise<InspectedBookPeriod[]>;
  importBookFile(
    bytes: Uint8Array,
    userId: string,
    expectations: readonly BookImportExpectation[],
  ): Promise<FiscalPeriodDbRecord[]>;
  close(): void;
};

export type BooksDbAdapterOptions = {
  store: BookStore;
  newBookName(): string;
  onFiscalPeriodRemoved(fiscalPeriodId: string): void;
  onSaveError(error: unknown): void;
};

type Book = {
  name: string;
  database: DocumentDbAdapter;
  saver: BookSaver;
  fiscalPeriodIds: Set<string>;
  lastChangedAt: number;
  close(): void;
};

type DateRange = { startDate: string; endDate: string };

function archiveOf(
  source: FiscalPeriodDbRecord,
  entries: readonly EntryDbRecord[],
  fixedAssets: readonly FixedAssetDbRecord[],
): FiscalPeriodArchiveDbImportInput {
  return {
    fiscalPeriod: {
      name: source.name,
      startDate: source.startDate,
      endDate: source.endDate,
      phase: source.phase,
      openingBalancesCompleted: source.openingBalancesCompleted,
      documentsReceivedCompleted: source.documentsReceivedCompleted,
      opening: source.opening,
    },
    entries: entries.map((entry) => ({
      date: entry.date,
      description: entry.description,
      localId: entry.localId,
      businessRate: entry.businessRate,
      lines: entry.lines.map((line) => ({
        side: line.side,
        bookAccountId: line.bookAccountId,
        amount: line.amount,
        partnerName: line.partnerName,
        taxCategoryId: line.taxCategoryId,
        businessCategoryId: line.businessCategoryId,
      })),
    })),
    fixedAssets: fixedAssets.map((asset) => ({
      name: asset.name,
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCost,
      usefulLife: asset.usefulLife,
      depreciationMethod: asset.depreciationMethod,
      businessRate: asset.businessRate,
      status: asset.status,
      disposalDate: asset.disposalDate,
      disposalPrice: asset.disposalPrice,
      bookAccountId: asset.bookAccountId,
    })),
  };
}

function rangesOverlap(left: DateRange, right: DateRange): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

function byCreation(left: FiscalPeriodDbRecord, right: FiscalPeriodDbRecord) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export async function createBooksDbAdapter(
  options: BooksDbAdapterOptions,
): Promise<BooksDbAdapter> {
  const { store } = options;
  const books: Book[] = [];
  const unreadableBooks: UnreadableBook[] = [];
  const listeners = new Set<() => void>();
  const queue = createOperationQueue();
  const blank = await createDocumentDbAdapter(null);

  const notify = () => {
    for (const listener of listeners) listener();
  };

  function register(name: string, database: DocumentDbAdapter): Book {
    let open = true;
    const book: Book = {
      name,
      database,
      fiscalPeriodIds: new Set(database.listFiscalPeriodIds()),
      lastChangedAt: database.lastChangedAt(),
      close: () => {},
      saver: createBookSaver({
        exportBytes: () =>
          queue.run(() => (open ? database.exportBytes() : null)),
        write: (bytes) => store.write(name, bytes),
        onStatusChange: notify,
        onError: options.onSaveError,
      }),
    };
    database.onChange(() => {
      book.fiscalPeriodIds = new Set(database.listFiscalPeriodIds());
      book.lastChangedAt = database.lastChangedAt();
      book.saver.markChanged();
      notify();
    });
    book.close = () => {
      open = false;
      database.close();
    };
    books.push(book);
    return book;
  }

  async function unregister(book: Book): Promise<void> {
    const index = books.indexOf(book);
    if (index >= 0) books.splice(index, 1);
    await book.saver.stop();
    book.close();
  }

  function bookOfPeriod(fiscalPeriodId: string): Book | null {
    return (
      books.find((book) => book.fiscalPeriodIds.has(fiscalPeriodId)) ?? null
    );
  }

  function dbOfPeriod(fiscalPeriodId: string): OpenkkDbPort {
    return (bookOfPeriod(fiscalPeriodId)?.database ?? blank).db;
  }

  async function dbHolding(
    holds: (db: OpenkkDbPort) => Promise<unknown>,
  ): Promise<OpenkkDbPort> {
    for (const book of books) {
      if ((await holds(book.database.db)) != null) return book.database.db;
    }
    return blank.db;
  }

  async function periodsOfUser(
    userId: string,
    exceptBook: Book | null,
  ): Promise<FiscalPeriodDbRecord[]> {
    const periods: FiscalPeriodDbRecord[] = [];
    for (const book of books) {
      if (book === exceptBook) continue;
      periods.push(...(await book.database.db.fiscalPeriods.getAll(userId)));
    }
    return periods.sort(byCreation);
  }

  async function assertNoOverlapInOtherBooks(
    userId: string,
    range: DateRange,
    exceptBook: Book | null,
  ): Promise<void> {
    assertNoOverlappingActiveFiscalPeriod(
      range,
      await periodsOfUser(userId, exceptBook),
    );
  }

  async function createBook<Result>(
    build: (db: OpenkkDbPort) => Promise<Result>,
  ): Promise<Result> {
    const database = await createDocumentDbAdapter(null);
    try {
      const result = await build(database.db);
      const name = options.newBookName();
      await store.write(name, database.exportBytes());
      register(name, database);
      notify();
      return result;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  async function readCarryoverSource(
    userId: string,
    sourceFiscalPeriodId: string,
    nextStartDate: string,
    reversalEntryIds: readonly string[],
    carryFixedAssets: boolean,
  ): Promise<{
    archive: FiscalPeriodArchiveDbImportInput;
    reversalEntryIndexes: number[];
  }> {
    const sourceDb = dbOfPeriod(sourceFiscalPeriodId);
    const source = await sourceDb.fiscalPeriods.getById(sourceFiscalPeriodId);
    if (source == null || source.userId !== userId) {
      throw serverNotFoundError(
        `fiscal period not found: ${sourceFiscalPeriodId}`,
      );
    }
    assertFiscalPeriodCanCarryOver(source, nextStartDate);
    const entries = await sourceDb.entries.getAll(source.id);
    const reversalEntryIndexes = reversalEntryIds.map((id) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) {
        throw serverNotFoundError(
          `Reversal entry ${id} not found in fiscal period ${source.id}`,
        );
      }
      return index;
    });
    const fixedAssets = carryFixedAssets
      ? await sourceDb.fixedAssets.getAll(source.id)
      : [];
    return {
      archive: archiveOf(source, entries, fixedAssets),
      reversalEntryIndexes,
    };
  }

  async function removeBook(book: Book): Promise<void> {
    await unregister(book);
    await store.remove(book.name);
  }

  async function relationOf(
    userId: string,
    period: FiscalPeriodDbRecord,
  ): Promise<BookFileRelation> {
    const sameBook = bookOfPeriod(period.id);
    const samePeriod =
      sameBook == null
        ? null
        : await sameBook.database.db.fiscalPeriods.getById(period.id);
    const others = (await periodsOfUser(userId, null)).filter(
      (other) =>
        other.id !== period.id &&
        other.archiveStatus === "active" &&
        period.archiveStatus === "active" &&
        rangesOverlap(other, period),
    );
    if (sameBook != null && samePeriod != null) {
      if (samePeriod.userId !== userId) {
        return { kind: "overlapping", existing: [samePeriod] };
      }
      return others.length > 0
        ? { kind: "overlapping", existing: others }
        : {
            kind: "same_period",
            existing: samePeriod,
            existingLastChangedAt: sameBook.lastChangedAt,
          };
    }
    if (others.length === 0) return { kind: "new" };
    const sameDates = others[0]!;
    const sameDatesBook = bookOfPeriod(sameDates.id);
    return others.length === 1 &&
      sameDatesBook != null &&
      sameDates.startDate === period.startDate &&
      sameDates.endDate === period.endDate
      ? {
          kind: "same_dates",
          existing: sameDates,
          existingLastChangedAt: sameDatesBook.lastChangedAt,
        }
      : { kind: "overlapping", existing: others };
  }

  function expectationMatches(
    expectation: BookImportExpectation,
    relation: BookFileRelation,
  ): boolean {
    if (expectation.relation !== relation.kind) return false;
    if (relation.kind === "same_period" || relation.kind === "same_dates") {
      return (
        expectation.existingFiscalPeriodId === relation.existing.id &&
        expectation.existingLastChangedAt === relation.existingLastChangedAt
      );
    }
    return relation.kind === "new";
  }

  async function replaceBook(
    book: Book,
    replacedFiscalPeriodId: string,
    incoming: BookFilePeriod,
  ): Promise<void> {
    if (book.fiscalPeriodIds.size !== 1) {
      throw new Error(`the book holds more than one period: ${book.name}`);
    }
    const database = await createDocumentDbAdapter(incoming.bytes);
    const name = book.name;
    try {
      await book.saver.stop();
      await store.write(name, database.exportBytes());
    } catch (error) {
      database.close();
      book.saver.resume();
      throw error;
    }
    await unregister(book);
    register(name, database);
    if (replacedFiscalPeriodId !== incoming.fiscalPeriod.id) {
      options.onFiscalPeriodRemoved(replacedFiscalPeriodId);
    }
  }

  async function addBook(incoming: BookFilePeriod): Promise<void> {
    const database = await createDocumentDbAdapter(incoming.bytes);
    try {
      const name = options.newBookName();
      await store.write(name, database.exportBytes());
      register(name, database);
    } catch (error) {
      database.close();
      throw error;
    }
  }

  for (const name of (await store.list()).sort()) {
    try {
      const bytes = await store.read(name);
      if (bytes == null) continue;
      const database = await createDocumentDbAdapter(bytes);
      const duplicated = database
        .listFiscalPeriodIds()
        .find((id) => bookOfPeriod(id) != null);
      if (duplicated != null) {
        database.close();
        throw new Error(`fiscal period is stored twice: ${duplicated}`);
      }
      const book = register(name, database);
      if (database.changedOnOpen) book.saver.markChanged();
    } catch (error) {
      unreadableBooks.push({ name, error });
    }
  }

  const db: OpenkkDbPort = {
    fiscalPeriods: runThroughQueue(queue, {
      getAll: (userId) => periodsOfUser(userId, null),
      getById: (id) => dbOfPeriod(id).fiscalPeriods.getById(id),
      async create(userId, input) {
        await assertNoOverlapInOtherBooks(userId, input, null);
        return createBook((bookDb) =>
          bookDb.fiscalPeriods.create(userId, input),
        );
      },
      async createNext(userId, input) {
        const carried = await readCarryoverSource(
          userId,
          input.sourceFiscalPeriodId,
          input.startDate,
          input.reversalEntryIds,
          input.carryFixedAssets,
        );
        await assertNoOverlapInOtherBooks(userId, input, null);
        return createBook(async (bookDb) => {
          const created = await bookDb.fiscalPeriods.create(userId, {
            name: input.name,
            startDate: input.startDate,
            endDate: input.endDate,
          });
          return bookDb.fiscalPeriods.applyCarryoverFromArchive(created.id, {
            archive: carried.archive,
            carryBalances: input.carryBalances,
            reversalEntryIndexes: carried.reversalEntryIndexes,
            carryFixedAssets: input.carryFixedAssets,
          });
        });
      },
      async applyCarryover(id, input) {
        const targetBook = bookOfPeriod(id);
        const targetDb = (targetBook?.database ?? blank).db;
        const current = await targetDb.fiscalPeriods.getById(id);
        if (
          current == null ||
          targetBook === bookOfPeriod(input.sourceFiscalPeriodId)
        ) {
          return targetDb.fiscalPeriods.applyCarryover(id, input);
        }
        assertDbCarryoverTargetAllowed(current);
        const carried = await readCarryoverSource(
          current.userId,
          input.sourceFiscalPeriodId,
          current.startDate,
          input.reversalEntryIds ?? [],
          input.carryFixedAssets,
        );
        return targetDb.fiscalPeriods.applyCarryoverFromArchive(id, {
          archive: carried.archive,
          carryBalances: input.carryBalances,
          reversalEntryIndexes:
            input.reversalEntryIds == null
              ? null
              : carried.reversalEntryIndexes,
          carryFixedAssets: input.carryFixedAssets,
        });
      },
      applyCarryoverFromArchive: (id, input) =>
        dbOfPeriod(id).fiscalPeriods.applyCarryoverFromArchive(id, input),
      async importArchived(userId, input) {
        await assertNoOverlapInOtherBooks(userId, input.fiscalPeriod, null);
        return createBook((bookDb) =>
          bookDb.fiscalPeriods.importArchived(userId, input),
        );
      },
      async patch(id, patch) {
        const book = bookOfPeriod(id);
        const current =
          book == null
            ? null
            : await book.database.db.fiscalPeriods.getById(id);
        if (
          current != null &&
          (patch.startDate != null || patch.endDate != null)
        ) {
          await assertNoOverlapInOtherBooks(
            current.userId,
            {
              startDate: patch.startDate ?? current.startDate,
              endDate: patch.endDate ?? current.endDate,
            },
            book,
          );
        }
        return dbOfPeriod(id).fiscalPeriods.patch(id, patch);
      },
      start: (id) => dbOfPeriod(id).fiscalPeriods.start(id),
      archive: (id) => dbOfPeriod(id).fiscalPeriods.archive(id),
      purgeArchivedData: (id) =>
        dbOfPeriod(id).fiscalPeriods.purgeArchivedData(id),
      async remove(id) {
        const book = bookOfPeriod(id);
        if (book == null) return;
        if (book.fiscalPeriodIds.size === 1) {
          await removeBook(book);
          notify();
        } else {
          await book.database.db.fiscalPeriods.remove(id);
        }
        options.onFiscalPeriodRemoved(id);
      },
    }),
    entries: runThroughQueue(queue, {
      getAll: (fiscalPeriodId) =>
        dbOfPeriod(fiscalPeriodId).entries.getAll(fiscalPeriodId),
      getById: async (id) =>
        (
          await dbHolding((bookDb) => bookDb.entries.getById(id))
        ).entries.getById(id),
      create: (userId, fiscalPeriodId, input) =>
        dbOfPeriod(fiscalPeriodId).entries.create(
          userId,
          fiscalPeriodId,
          input,
        ),
      update: async (id, input) =>
        (
          await dbHolding((bookDb) => bookDb.entries.getById(id))
        ).entries.update(id, input),
      remove: async (id) =>
        (
          await dbHolding((bookDb) => bookDb.entries.getById(id))
        ).entries.remove(id),
      importMany: (userId, fiscalPeriodId, entries) =>
        dbOfPeriod(fiscalPeriodId).entries.importMany(
          userId,
          fiscalPeriodId,
          entries,
        ),
    }),
    fixedAssets: runThroughQueue(queue, {
      getAll: (fiscalPeriodId) =>
        dbOfPeriod(fiscalPeriodId).fixedAssets.getAll(fiscalPeriodId),
      getById: async (id) =>
        (
          await dbHolding((bookDb) => bookDb.fixedAssets.getById(id))
        ).fixedAssets.getById(id),
      create: (userId, fiscalPeriodId, input) =>
        dbOfPeriod(fiscalPeriodId).fixedAssets.create(
          userId,
          fiscalPeriodId,
          input,
        ),
      patch: async (id, patch) =>
        (
          await dbHolding((bookDb) => bookDb.fixedAssets.getById(id))
        ).fixedAssets.patch(id, patch),
      remove: async (id) =>
        (
          await dbHolding((bookDb) => bookDb.fixedAssets.getById(id))
        ).fixedAssets.remove(id),
    }),
    preClosings: runThroughQueue(queue, {
      run: (fiscalPeriodId) =>
        dbOfPeriod(fiscalPeriodId).preClosings.run(fiscalPeriodId),
      cancel: (fiscalPeriodId) =>
        dbOfPeriod(fiscalPeriodId).preClosings.cancel(fiscalPeriodId),
    }),
    closings: runThroughQueue(queue, {
      run: (fiscalPeriodId, entries) =>
        dbOfPeriod(fiscalPeriodId).closings.run(fiscalPeriodId, entries),
    }),
    masterData: createMasterDataDb(),
  };

  const bookOperations = runThroughQueue(queue, {
    async inspect(
      bytes: Uint8Array,
      userId: string,
    ): Promise<InspectedBookPeriod[]> {
      const inspected: InspectedBookPeriod[] = [];
      for (const period of await splitBookFile(bytes)) {
        if (period.fiscalPeriod.userId !== userId) continue;
        inspected.push({
          fiscalPeriod: period.fiscalPeriod,
          lastChangedAt: period.lastChangedAt,
          relation: await relationOf(userId, period.fiscalPeriod),
        });
      }
      return inspected;
    },
    async import(
      bytes: Uint8Array,
      userId: string,
      expectations: readonly BookImportExpectation[],
    ): Promise<FiscalPeriodDbRecord[]> {
      const incoming = (await splitBookFile(bytes)).filter(
        (period) => period.fiscalPeriod.userId === userId,
      );
      const planned: Array<{
        period: BookFilePeriod;
        relation: BookFileRelation;
      }> = [];
      for (const expectation of expectations) {
        const period = incoming.find(
          (candidate) =>
            candidate.fiscalPeriod.id === expectation.fiscalPeriodId,
        );
        if (period == null) {
          throw new BookImportChangedError(expectation.fiscalPeriodId);
        }
        const relation = await relationOf(userId, period.fiscalPeriod);
        if (!expectationMatches(expectation, relation)) {
          throw new BookImportChangedError(expectation.fiscalPeriodId);
        }
        planned.push({ period, relation });
      }
      const imported: FiscalPeriodDbRecord[] = [];
      for (const { period, relation } of planned) {
        if (relation.kind === "new") {
          await addBook(period);
        } else if (
          relation.kind === "same_period" ||
          relation.kind === "same_dates"
        ) {
          const book = bookOfPeriod(relation.existing.id);
          if (book == null) {
            throw new BookImportChangedError(period.fiscalPeriod.id);
          }
          await replaceBook(book, relation.existing.id, period);
        }
        imported.push(period.fiscalPeriod);
      }
      notify();
      return imported;
    },
    async export(fiscalPeriodId: string): Promise<ExportedBook | null> {
      const book = bookOfPeriod(fiscalPeriodId);
      if (book == null) return null;
      const fiscalPeriod =
        await book.database.db.fiscalPeriods.getById(fiscalPeriodId);
      if (fiscalPeriod == null) return null;
      return {
        fiscalPeriod,
        lastChangedAt: book.lastChangedAt,
        bytes: book.database.exportBytes(),
      };
    },
  });

  return {
    db,
    unreadableBooks,
    storageStatus() {
      const statuses = books.map((book) => book.saver.status());
      if (statuses.includes("failed")) return "failed";
      return statuses.includes("saving") ? "saving" : "saved";
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async flush() {
      for (const book of [...books]) await book.saver.flush();
    },
    lastChangedAt(fiscalPeriodId) {
      return bookOfPeriod(fiscalPeriodId)?.lastChangedAt ?? null;
    },
    exportBook: (fiscalPeriodId) => bookOperations.export(fiscalPeriodId),
    inspectBookFile: (bytes, userId) => bookOperations.inspect(bytes, userId),
    importBookFile: (bytes, userId, expectations) =>
      bookOperations.import(bytes, userId, expectations),
    close() {
      for (const book of books.splice(0)) book.close();
      blank.close();
    },
  };
}
