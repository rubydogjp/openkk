import {
  assertBookFileSize,
  BookFileFormatError,
  createBookDbAdapter,
  isBookContentError,
  readBookRecords,
  readStoredFiscalPeriods,
  rebuildBookFileBytes,
  type BookDbAdapter,
} from "@rubydogjp/openkk-book-db-adapter";
import type {
  EntryDbRecord,
  FiscalPeriodDbRecord,
  FixedAssetDbRecord,
} from "@rubydogjp/openkk-engine";

export type BookFilePeriod = {
  fiscalPeriod: FiscalPeriodDbRecord;
  entries: EntryDbRecord[];
  fixedAssets: FixedAssetDbRecord[];
  lastChangedAt: number | null;
  bytes: Uint8Array;
};

export type UnreadableBookFilePeriod = {
  fiscalPeriodId: string | null;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  error: unknown;
};

export type BookFileSplit = {
  periods: BookFilePeriod[];
  unreadable: UnreadableBookFilePeriod[];
};

type PeriodContent = {
  fiscalPeriod: FiscalPeriodDbRecord;
  entries: EntryDbRecord[];
  fixedAssets: FixedAssetDbRecord[];
};

export class BookSplitMismatchError extends Error {
  constructor(readonly fiscalPeriodId: string) {
    super(`the split book does not match its source: ${fiscalPeriodId}`);
    this.name = "BookSplitMismatchError";
  }
}

async function readPeriodContent(
  database: BookDbAdapter,
  fiscalPeriodId: string,
): Promise<PeriodContent | null> {
  const fiscalPeriod = await database.db.fiscalPeriods.getById(fiscalPeriodId);
  if (fiscalPeriod == null) return null;
  return {
    fiscalPeriod,
    entries: await database.db.entries.getAll(fiscalPeriodId),
    fixedAssets: await database.db.fixedAssets.getAll(fiscalPeriodId),
  };
}

function sameContent(left: PeriodContent, right: PeriodContent | null) {
  return right != null && JSON.stringify(left) === JSON.stringify(right);
}

async function keepOnlyPeriod(
  bytes: Uint8Array,
  fiscalPeriodId: string,
  otherIds: readonly string[],
  expected: PeriodContent,
  lastChangedAt: number | null,
): Promise<Uint8Array> {
  const copy = await createBookDbAdapter(bytes);
  try {
    for (const otherId of otherIds) {
      await copy.db.fiscalPeriods.remove(otherId);
    }
    copy.compact();
    if (lastChangedAt != null) copy.restoreLastChangedAt(lastChangedAt);
    const kept = copy.listFiscalPeriodIds();
    if (
      kept.length !== 1 ||
      kept[0] !== fiscalPeriodId ||
      !sameContent(expected, await readPeriodContent(copy, fiscalPeriodId))
    ) {
      throw new BookSplitMismatchError(fiscalPeriodId);
    }
    return copy.exportBytes();
  } finally {
    copy.close();
  }
}

async function splitOutPeriod(
  source: BookDbAdapter,
  bytes: Uint8Array,
  ids: readonly string[],
  id: string,
): Promise<BookFilePeriod> {
  const content = await readPeriodContent(source, id);
  if (content == null) throw new BookSplitMismatchError(id);
  const single =
    ids.length === 1 && !source.changedOnOpen
      ? bytes
      : await keepOnlyPeriod(
          bytes,
          id,
          ids.filter((otherId) => otherId !== id),
          content,
          source.lastChangedAtOnOpen,
        );
  return {
    ...content,
    lastChangedAt: source.lastChangedAtOnOpen,
    bytes: single,
  };
}

export async function splitReadableBookFilePeriods(
  bytes: Uint8Array,
): Promise<BookFileSplit> {
  let source: BookDbAdapter;
  try {
    source = await createBookDbAdapter(bytes);
  } catch (error) {
    if (!(error instanceof BookFileFormatError)) throw error;
    console.error("[openkk] the book cannot be opened:", error);
    return {
      periods: [],
      unreadable: [
        {
          fiscalPeriodId: null,
          name: null,
          startDate: null,
          endDate: null,
          error,
        },
      ],
    };
  }
  try {
    const ids = source.listFiscalPeriodIds();
    const split: BookFileSplit = { periods: [], unreadable: [] };
    for (const id of ids) {
      try {
        split.periods.push(await splitOutPeriod(source, bytes, ids, id));
      } catch (error) {
        if (!isBookContentError(error)) {
          console.error(
            `[openkk] fiscal period ${id} could not be split out:`,
            error,
          );
          throw error;
        }
        console.error(`[openkk] fiscal period ${id} cannot be read:`, error);
        split.unreadable.push({
          fiscalPeriodId: id,
          ...source.readStoredFiscalPeriodLabel(id),
          error,
        });
      }
    }
    return split;
  } finally {
    source.close();
  }
}

function asBookContentFailure(error: unknown): unknown {
  if (error instanceof BookFileFormatError || !isBookContentError(error)) {
    return error;
  }
  return new BookFileFormatError(
    "invalid_content",
    `the book holds records that cannot be read: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

async function rebuildBookFilePeriods(
  bytes: Uint8Array,
): Promise<BookFilePeriod[]> {
  assertBookFileSize(bytes);
  const source = await createBookDbAdapter(bytes);
  try {
    const lastChangedAt = source.lastChangedAtOnOpen;
    const periods: BookFilePeriod[] = [];
    for (const records of await readBookRecords(source)) {
      periods.push({
        ...records,
        lastChangedAt,
        bytes: await rebuildBookFileBytes(records, lastChangedAt),
      });
    }
    return periods;
  } finally {
    source.close();
  }
}

export async function splitBookFile(
  bytes: Uint8Array,
): Promise<BookFilePeriod[]> {
  try {
    return await rebuildBookFilePeriods(bytes);
  } catch (error) {
    throw asBookContentFailure(error);
  }
}

export async function readStoredFiscalPeriodIds(store: {
  list(): Promise<string[]>;
  read(name: string): Promise<Uint8Array | null>;
}): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const name of await store.list()) {
    const bytes = await store.read(name);
    if (bytes == null) continue;
    for (const { id } of await readStoredFiscalPeriods(bytes)) {
      if (id != null) ids.add(id);
    }
  }
  return ids;
}
