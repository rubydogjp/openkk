import { describe, expect, it } from "vitest";

import { createOpenkkServer } from "./index.js";
import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
  MAX_TEXT_FIELD_LENGTH,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
  FiscalPeriodOpeningApiRecord,
  OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";

describe("openkk server entries API", () => {
  it.each(["create", "update", "importMany"] as const)(
    "rejects an omitted localId before %s persists data",
    async (operation) => {
      const server = createOpenkkServer(createEntryDb(), { userId: "user-1" });
      const original = await server.entries.create("fp-1", validEntryInput());
      const input = validEntryInput();
      Reflect.deleteProperty(input, "localId");

      const result =
        operation === "create"
          ? server.entries.create("fp-1", input)
          : operation === "update"
            ? server.entries.update("fp-1", original.id, input)
            : server.entries.importMany("fp-1", [input]);

      await expect(result).rejects.toMatchObject({ statusCode: 400 });
      expect(await server.entries.getAll("fp-1")).toEqual([original]);
    },
  );

  it("rejects child-data reads after archived data was purged", async () => {
    const db = createEntryDb({
      archiveStatus: "purged",
    });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(server.entries.getAll("fp-1")).rejects.toThrow(
      /after archived data was purged/,
    );
  });

  it("finishes a queued data read before purging archived data", async () => {
    const db = createEntryDb({
      phase: "post_closing",
      archiveStatus: "archived",
      documentsReceivedCompleted: true,
    });
    const trace: string[] = [];
    let releaseRead!: () => void;
    let markReadStarted!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    db.entries.getAll = async () => {
      trace.push("read:start");
      markReadStarted();
      await readGate;
      trace.push("read:end");
      return [];
    };
    db.fiscalPeriods.purgeArchivedData = async (id) => {
      trace.push("purge");
      return fiscalPeriod({
        id,
        phase: "post_closing",
        archiveStatus: "purged",
        documentsReceivedCompleted: true,
      });
    };
    const server = createOpenkkServer(db, { userId: "user-1" });

    const reading = server.entries.getAll("fp-1");
    const purging = server.fiscalPeriods.purgeArchivedData("fp-1");
    await readStarted;
    expect(trace).toEqual(["read:start"]);

    releaseRead();
    await Promise.all([reading, purging]);
    expect(trace).toEqual(["read:start", "read:end", "purge"]);
  });

  it("rejects invalid entry dates before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-02-29",
        description: "不正日付の仕訳",
        localId: "bad-date",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
        ],
      }),
    ).rejects.toThrow(/Entry date is invalid/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects invalid entry numbers before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "不正金額の仕訳",
        localId: "bad-amount",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: Infinity,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
        ],
      }),
    ).rejects.toThrow(/Entry line amount must be a non-negative finite number/);

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "不正事業割合の仕訳",
        localId: "bad-rate",
        businessRate: 1.5,
        lines: [],
      }),
    ).rejects.toThrow(/Entry business rate must be between 0 and 1/);

    await expect(
      server.entries.create("fp-1", {
        ...validEntryInput({ localId: "fractional-yen" }),
        lines: validEntryInput().lines.map((line) => ({
          ...line,
          amount: 1000.5,
        })),
      }),
    ).rejects.toThrow(/safe integer/);

    const hugeLine = {
      ...validEntryInput().lines[0]!,
      amount: Number.MAX_SAFE_INTEGER,
    };
    await expect(
      server.entries.create("fp-1", {
        ...validEntryInput({ localId: "overflow-total" }),
        lines: [
          { ...hugeLine, side: "debit" },
          { ...hugeLine, side: "debit" },
          { ...hugeLine, side: "credit" },
          { ...hugeLine, side: "credit" },
        ],
      }),
    ).rejects.toThrow(/totals exceed the safe integer range/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects runtime field types before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const invalidPartner = validEntryInput({ localId: "invalid-partner" });
    invalidPartner.lines[0]!.partnerName = 123 as unknown as string;

    await expect(
      server.entries.create("fp-1", invalidPartner),
    ).rejects.toThrow(/Entry line partner must be a string/);
    await expect(
      server.entries.create("fp-1", {
        ...validEntryInput(),
        localId: 123,
      } as unknown as EntryUpsertInput),
    ).rejects.toThrow(/Entry localId must be a non-blank string or null/);
    await expect(
      server.entries.create("fp-1", validEntryInput({ localId: "" })),
    ).rejects.toThrow(/Entry localId must be a non-blank string or null/);
    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects unbalanced entries before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "貸借不一致の仕訳",
        localId: "unbalanced",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
          {
            side: "credit",
            bookAccountId: "acct_sales",
            amount: 900,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
        ],
      }),
    ).rejects.toThrow(/debit total \(1000\) must equal credit total \(900\)/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects empty and zero-value entries before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create(
        "fp-1",
        validEntryInput({ localId: "empty", lines: [] }),
      ),
    ).rejects.toThrow(/must have positive debit and credit lines/);
    await expect(
      server.entries.create("fp-1", {
        ...validEntryInput({ localId: "zero" }),
        lines: validEntryInput().lines.map((line) => ({ ...line, amount: 0 })),
      }),
    ).rejects.toThrow(/must have positive debit and credit lines/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects oversized compound entries before inspecting every line", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const line = validEntryInput().lines[0]!;

    await expect(
      server.entries.create("fp-1", {
        ...validEntryInput({ localId: "too-many-lines" }),
        lines: Array.from({ length: MAX_ENTRY_LINES + 1 }, () => line),
      }),
    ).rejects.toThrow(/1,000 line limit/);
    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects entries dated outside the fiscal period", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create(
        "fp-1",
        validEntryInput({ date: "2027-01-01", localId: "outside" }),
      ),
    ).rejects.toThrow(/must be within fiscal period 2026-01-01 to 2026-12-31/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects text fields beyond the shared character limit", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const tooLong = "あ".repeat(MAX_TEXT_FIELD_LENGTH + 1);

    await expect(
      server.entries.create("fp-1", validEntryInput({ description: tooLong })),
    ).rejects.toThrow(/character limit/);
    await expect(
      server.entries.create(
        "fp-1",
        validEntryInput({
          lines: validEntryInput().lines.map((line) => ({
            ...line,
            partnerName: tooLong,
          })),
        }),
      ),
    ).rejects.toThrow(/character limit/);
    await expect(
      server.entries.create(
        "fp-1",
        validEntryInput({
          lines: validEntryInput().lines.map((line) => ({
            ...line,
            taxCategoryId: tooLong,
          })),
        }),
      ),
    ).rejects.toThrow(/character limit/);

    expect(
      (await server.entries.create(
        "fp-1",
        validEntryInput({
          localId: "at-the-limit",
          description: "あ".repeat(MAX_TEXT_FIELD_LENGTH),
        }),
      )).description,
    ).toHaveLength(MAX_TEXT_FIELD_LENGTH);
  });

  it("rejects unknown book accounts and preserves custom categories", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create(
        "fp-1",
        validEntryInput({
          lines: validEntryInput().lines.map((line) => ({
            ...line,
            bookAccountId: "unknown-account",
          })),
        }),
      ),
    ).rejects.toThrow(/Entry line references unknown book account/);
    const created = await server.entries.create(
      "fp-1",
      validEntryInput({
        localId: "custom-categories",
        lines: validEntryInput().lines.map((line) => ({
          ...line,
          taxCategoryId: "custom-tax",
          businessCategoryId: "custom-business",
        })),
      }),
    );
    expect(created.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taxCategoryId: "custom-tax",
          businessCategoryId: "custom-business",
        }),
      ]),
    );
  });

  it("reserves generated localIds for the atomic closing operation", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.importMany("fp-1", [
        validEntryInput({ localId: "virtual:not-allowed" }),
      ]),
    ).rejects.toThrow(/localId prefix virtual: is reserved/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects every entry mutation after final closing", async () => {
    const db = createEntryDb({ phase: "post_closing" });
    const existing = await db.entries.create(
      "user-1",
      "fp-1",
      validEntryInput({ localId: "existing" }),
    );
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", validEntryInput({ localId: "new" })),
    ).rejects.toThrow(/cannot create entry from phase post_closing/);
    await expect(
      server.entries.update(
        "fp-1",
        existing.id,
        validEntryInput({ localId: "existing" }),
      ),
    ).rejects.toThrow(/cannot update entry from phase post_closing/);
    await expect(server.entries.remove("fp-1", existing.id)).rejects.toThrow(
      /cannot delete entry from phase post_closing/,
    );
    await expect(
      server.entries.importMany("fp-1", [
        validEntryInput({ localId: "import" }),
      ]),
    ).rejects.toThrow(/cannot import entries from phase post_closing/);

    expect(await server.entries.getAll("fp-1")).toHaveLength(1);
  });

  it("rejects invalid dates in bulk import before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.importMany("fp-1", [
        {
          date: "2026-04-01",
          description: "valid",
          localId: "valid",
          businessRate: 1,
          lines: validEntryInput().lines,
        },
        {
          date: "2026-13-01",
          description: "invalid",
          localId: "invalid",
          businessRate: 1,
          lines: [],
        },
      ]),
    ).rejects.toThrow(/Entry date is invalid/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects a non-array bulk import payload as a validation error", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.importMany(
        "fp-1",
        null as unknown as EntryUpsertInput[],
      ),
    ).rejects.toThrow(/Entry import input must be an array/);
    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects oversized import batches before validating every item", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const oversized = Array.from(
      { length: MAX_ENTRY_IMPORT_ITEMS + 1 },
      () => null,
    ) as unknown as EntryUpsertInput[];

    await expect(server.entries.importMany("fp-1", oversized)).rejects.toThrow(
      /item limit/,
    );
    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects oversized import line totals before validating every line", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const repeatedLines = Array.from({ length: MAX_ENTRY_LINES }, () =>
      validEntryInput().lines[0]!,
    );
    const oversized = Array.from(
      { length: MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1 },
      (_, index) =>
        validEntryInput({
          localId: `many-lines-${index}`,
          lines: repeatedLines,
        }),
    );

    await expect(server.entries.importMany("fp-1", oversized)).rejects.toThrow(
      /100,000 line limit/,
    );
    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects entry creation in archived fiscal periods", async () => {
    const db = createEntryDb({ archiveStatus: "archived" });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "archived",
        localId: "archived-entry",
        businessRate: 1,
        lines: [],
      }),
    ).rejects.toThrow(/Archived fiscal period fp-1 cannot create entry/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("deletes an entry only when it belongs to the requested fiscal period", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.entries.create("fp-1", {
      date: "2026-04-01",
      description: "削除対象の仕訳",
      localId: "delete-target",
      businessRate: 1,
      lines: [
        {
          side: "debit",
          bookAccountId: "acct_cash",
          amount: 1000,
          partnerName: "",
          taxCategoryId: "tax_exempt",
          businessCategoryId: "biz_none",
        },
        {
          side: "credit",
          bookAccountId: "acct_sales",
          amount: 1000,
          partnerName: "",
          taxCategoryId: "tax_exempt",
          businessCategoryId: "biz_none",
        },
      ],
    });

    await expect(server.entries.remove("fp-other", created.id)).rejects.toThrow(
      /Fiscal period fp-other not found/,
    );
    expect(await server.entries.getAll("fp-1")).toHaveLength(1);

    await server.entries.remove("fp-1", created.id);
    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });
});

function createEntryDb(
  fiscalPeriodOverrides: Partial<FiscalPeriodApiRecord> = {},
): OpenkkDbPort {
  const entries = new Map<string, EntryApiRecord>();
  return {
    fiscalPeriods: {
      async getAll() {
        return [fiscalPeriod({ id: "fp-1", ...fiscalPeriodOverrides })];
      },
      async getById(id) {
        return id === "fp-1"
          ? fiscalPeriod({ id, ...fiscalPeriodOverrides })
          : null;
      },
      async create(_userId: string, input: FiscalPeriodCreateInput) {
        return fiscalPeriod({ ...input, id: "fp-1" });
      },
      async createNext() {
        throw new Error("unexpected createNext call");
      },
      async importArchived() {
        return fiscalPeriod({ id: "fp-archive", archiveStatus: "archived" });
      },
      async update(id: string, patch: FiscalPeriodPatchInput) {
        const { opening, ...rest } = patch;
        return fiscalPeriod({
          id,
          ...rest,
          ...(opening != null
            ? { opening: { ...fiscalPeriod({ id }).opening, ...opening } }
            : {}),
        });
      },
      async start(id: string) {
        return fiscalPeriod({ id, phase: "journalizing" });
      },
      async archive(id: string) {
        return fiscalPeriod({ id, archiveStatus: "archived" });
      },
      async purgeArchivedData(id: string) {
        return fiscalPeriod({
          id,
          archiveStatus: "purged",
        });
      },
      async delete() {},
    },
    entries: {
      async getAll(fiscalPeriodId) {
        return [...entries.values()].filter(
          (entry) => entry.fiscalPeriodId === fiscalPeriodId,
        );
      },
      async getById(id) {
        return entries.get(id) ?? null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: EntryUpsertInput,
      ) {
        const record = entry({
          id: `entry-${entries.size + 1}`,
          fiscalPeriodId,
          ...input,
          localId: input.localId,
          lines: entryLinesWithIds(input.lines),
        });
        entries.set(record.id, record);
        return record;
      },
      async update(id: string, input: EntryUpsertInput) {
        const current = entries.get(id);
        if (current == null) throw new Error(`entry not found: ${id}`);
        const updated = entry({
          ...current,
          ...input,
          localId: input.localId,
          lines: entryLinesWithIds(input.lines),
        });
        entries.set(id, updated);
        return updated;
      },
      async delete(id: string) {
        entries.delete(id);
      },
      async importMany(
        _userId: string,
        fiscalPeriodId: string,
        inputs: EntryUpsertInput[],
      ) {
        return inputs.map((input, index) =>
          entry({
            id: `entry-${index + 1}`,
            fiscalPeriodId,
            ...input,
            localId: input.localId,
            lines: entryLinesWithIds(input.lines),
          }),
        );
      },
    },
    fixedAssets: {
      async getAll() {
        return [];
      },
      async getById() {
        return null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: FixedAssetCreateInput,
      ) {
        return fixedAsset({ id: "asset-1", fiscalPeriodId, ...input });
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, fiscalPeriodId: "fp-1", ...changedFields(patch) });
      },
      async delete() {},
    },
    preClosings: {
      async get() {
        return false;
      },
      async run() {
        return fiscalPeriod({ phase: "pre_closing" });
      },
      async cancel() {
        return fiscalPeriod({ phase: "journalizing" });
      },
    },
    closings: {
      async get(): Promise<boolean> {
        return false;
      },
      async run() {
        return fiscalPeriod({ phase: "post_closing" });
      },
    },
    masterData: {
      async getBookAccounts(): Promise<MasterBookAccountDbRecord[]> {
        return [];
      },
      async getTaxCategories(): Promise<MasterTaxCategoryDbRecord[]> {
        return [];
      },
      async getBusinessCategories(): Promise<
        MasterBusinessCategoryDbRecord[]
      > {
        return [];
      },
    },
  };
}

const TEST_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function entryLinesWithIds(
  lines: EntryUpsertInput["lines"],
): EntryApiRecord["lines"] {
  return lines.map((line, index) => ({ ...line, id: `line-${index + 1}` }));
}

function validEntryInput(
  overrides: Partial<EntryUpsertInput> = {},
): EntryUpsertInput {
  const base: EntryUpsertInput = {
    date: "2026-04-01",
    description: "valid entry",
    localId: "valid-entry",
    businessRate: 1,
    lines: [
      {
        side: "debit",
        bookAccountId: "acct_cash",
        amount: 1000,
        partnerName: "",
        taxCategoryId: "tax_exempt",
        businessCategoryId: "biz_none",
      },
      {
        side: "credit",
        bookAccountId: "acct_sales",
        amount: 1000,
        partnerName: "",
        taxCategoryId: "tax_exempt",
        businessCategoryId: "biz_none",
      },
    ],
  };
  return Object.assign(base, overrides);
}

function fiscalPeriod(
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
  const base: FiscalPeriodApiRecord = {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: emptyOpening(),
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    archivedAt: null,
  };
  const period = Object.assign(base, overrides);
  return {
    ...period,
    opening: overrides.opening ?? emptyOpening(),
  };
}

function emptyOpening(): FiscalPeriodOpeningApiRecord {
  return { openingBalanceLines: [], openingJournals: [] };
}

function entry(overrides: Partial<EntryApiRecord>): EntryApiRecord {
  const base: EntryApiRecord = {
    id: "entry-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    description: "entry",
    localId: null,
    businessRate: 1,
    lines: [],
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  return Object.assign(base, overrides);
}

function fixedAsset(
  overrides: Partial<FixedAssetApiRecord>,
): FixedAssetApiRecord {
  const base: FixedAssetApiRecord = {
    id: "asset-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    name: "asset",
    acquisitionDate: "2026-01-01",
    acquisitionCost: 0,
    usefulLife: 0,
    depreciationMethod: "straight_line",
    businessRate: 1,
    status: "active",
    disposalDate: null,
    disposalPrice: null,
    bookAccountId: "",
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  return Object.assign(base, overrides);
}

function changedFields<T extends object>(patch: T): {
  [K in keyof T]?: Exclude<T[K], null>;
} {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null),
  ) as { [K in keyof T]?: Exclude<T[K], null> };
}
