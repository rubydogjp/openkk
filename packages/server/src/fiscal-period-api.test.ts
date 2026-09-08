import { describe, expect, it } from "vitest";

import {
  AppError,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
} from "@rubydogjp/openkk-server-domain";
import { createOpenkkServer } from "./index.js";
import type {
  ClosingApiRecord,
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodArchiveImportInput,
  FiscalPeriodArchiveDbImportInput,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
  OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";

type StoredFiscalPeriodApiRecord = FiscalPeriodApiRecord & { userId: string };

describe("openkk server fiscal period API", () => {
  it("rejects invalid fiscal period dates before persisting", async () => {
    const db = createFiscalPeriodDb([]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.create({
        name: "不正な期間",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      }),
    ).rejects.toThrow(/Fiscal period start date must be on or before end date/);

    expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([]);
  });

  it("patches only fiscal periods owned by the current user", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        name: "user-1 period",
        phase: "pre_opening",
        settingsCompleted: false,
      }),
      fiscalPeriod({
        id: "fp-user-2",
        userId: "user-2",
        name: "user-2 period",
        phase: "pre_opening",
        settingsCompleted: false,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-2", { name: "updated by user-1" }),
    ).rejects.toThrow(/Fiscal period fp-user-2 not found/);

    expect((await db.fiscalPeriods.getById("fp-user-2"))?.name).toBe(
      "user-2 period",
    );

    const updated = await server.fiscalPeriod.patch("fp-user-1", {
      name: "updated by owner",
    });
    expect(updated.name).toBe("updated by owner");
  });

  it("rejects fiscal period patches that would invert the period range", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        phase: "pre_opening",
        settingsCompleted: false,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", { startDate: "2027-01-01" }),
    ).rejects.toThrow(/Fiscal period start date must be on or before end date/);

    expect((await db.fiscalPeriods.getById("fp-user-1"))?.startDate).toBe(
      "2026-01-01",
    );
  });

  it("rejects a period range patch that would exclude an existing opening journal", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        phase: "pre_opening",
        settingsCompleted: false,
        openingBalancesCompleted: false,
        opening: {
          id: "op-fp-user-1",
          userId: "user-1",
          fiscalPeriodId: "fp-user-1",
          createdAt: TEST_TIMESTAMP,
          updatedAt: TEST_TIMESTAMP,
          openingBalanceLines: [],
          openingJournals: [
            openingJournal({
              date: "2026-01-01",
              lines: [
                openingLine({ id: "d", side: "debit", amount: 1000 }),
                openingLine({ id: "c", side: "credit", amount: 1000 }),
              ],
            }),
          ],
        },
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", { startDate: "2026-02-01" }),
    ).rejects.toThrow(/Opening journal date .* must be within fiscal period/);

    expect((await db.fiscalPeriods.getById("fp-user-1"))?.startDate).toBe(
      "2026-01-01",
    );
  });

  it("rejects a period range patch that excludes a saved entry", async () => {
    const period = fiscalPeriod({
      id: "fp-user-1",
      userId: "user-1",
      phase: "pre_opening",
      settingsCompleted: false,
    });
    const db = createFiscalPeriodDb([period], {
      entries: [
        entry({
          id: "entry-imported",
          fiscalPeriodId: period.id,
          date: "2026-01-15",
        }),
      ],
    });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch(period.id, { startDate: "2026-02-01" }),
    ).rejects.toThrow(/Entry entry-imported date .* must be within fiscal period/);
    expect((await db.fiscalPeriods.getById(period.id))?.startDate).toBe(
      "2026-01-01",
    );
  });

  it("rejects a period range patch that excludes fixed asset dates", async () => {
    const period = fiscalPeriod({
      id: "fp-user-1",
      userId: "user-1",
      phase: "pre_opening",
      settingsCompleted: false,
    });
    const assets = [
      fixedAsset({
        id: "asset-acquired",
        fiscalPeriodId: period.id,
        acquisitionDate: "2026-11-01",
      }),
      fixedAsset({
        id: "asset-sold",
        fiscalPeriodId: period.id,
        acquisitionDate: "2025-01-01",
        status: "sold",
        disposalDate: "2026-02-01",
      }),
    ];
    const db = createFiscalPeriodDb([period], { fixedAssets: assets });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch(period.id, { endDate: "2026-10-31" }),
    ).rejects.toThrow(/asset-acquired acquisition date/);
    await expect(
      server.fiscalPeriod.patch(period.id, { startDate: "2026-03-01" }),
    ).rejects.toThrow(/asset-sold disposal date/);
  });

  it("allows a period start after an existing fixed asset acquisition date", async () => {
    const period = fiscalPeriod({
      id: "fp-user-1",
      userId: "user-1",
      phase: "pre_opening",
      settingsCompleted: false,
    });
    const db = createFiscalPeriodDb([period], {
      fixedAssets: [
        fixedAsset({
          id: "asset-from-prior-year",
          fiscalPeriodId: period.id,
          acquisitionDate: "2025-06-01",
        }),
      ],
    });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch(period.id, { startDate: "2026-02-01" }),
    ).resolves.toMatchObject({ startDate: "2026-02-01" });
  });

  it("rejects null lifecycle fields and mismatched opening ownership", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        phase: "pre_opening",
        settingsCompleted: false,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        settingsCompleted: null,
      } as unknown as FiscalPeriodPatchInput),
    ).rejects.toThrow(/settingsCompleted must be a boolean/);
    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({ userId: "another-user" }),
      }),
    ).rejects.toThrow(/Opening ownership must match/);
  });

  it("allows next-period opening balances to be carried before settings start", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        phase: "pre_opening",
        settingsCompleted: false,
        openingBalancesCompleted: false,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    const updated = await server.fiscalPeriod.patch("fp-user-1", {
      openingBalancesCompleted: true,
      opening: openingPatch({
        openingBalanceLines: [
          { id: "asset", accountId: "a:現金", amount: 1000 },
          { id: "equity", accountId: "l:元入金", amount: 1000 },
        ],
      }),
    });

    expect(updated.phase).toBe("pre_opening");
    expect(updated.settingsCompleted).toBe(false);
    expect(updated.openingBalancesCompleted).toBe(true);
  });

  it("rejects setup-field patches after the fiscal period has started", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-started", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-started", { endDate: "2026-11-30" }),
    ).rejects.toThrow(/cannot update endDate from phase journalizing/);
    await expect(
      server.fiscalPeriod.patch("fp-started", { settingsCompleted: false }),
    ).rejects.toThrow(
      /cannot update settingsCompleted from phase journalizing/,
    );

    expect((await db.fiscalPeriods.getById("fp-started"))?.endDate).toBe(
      "2026-12-31",
    );
  });

  it("rejects patches to archived fiscal periods", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-archived",
        userId: "user-1",
        archiveStatus: "archived",
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    const error = await captureAsyncError(() =>
      server.fiscalPeriod.patch("fp-archived", { name: "updated" }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "Archived fiscal period fp-archived cannot be updated",
    );
    expect((error as AppError).messageForUser).toContain("圧縮保存済み");
    expect((error as AppError).statusCode).toBe(409);

    expect((await db.fiscalPeriods.getById("fp-archived"))?.name).toBe(
      "2026年分",
    );
  });

  it("allows only document receipt completion after final closing", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-closed",
        userId: "user-1",
        phase: "post_closing",
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-closed", { name: "renamed after close" }),
    ).rejects.toThrow(/only allows document receipt completion after closing/);

    const completed = await server.fiscalPeriod.patch("fp-closed", {
      documentsReceivedCompleted: true,
    });
    expect(completed.documentsReceivedCompleted).toBe(true);
    expect(completed.name).toBe("2026年分");
  });

  it("archives only fully completed post-closing periods", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-open", userId: "user-1" }),
      fiscalPeriod({
        id: "fp-no-documents",
        userId: "user-1",
        phase: "post_closing",
      }),
      fiscalPeriod({
        id: "fp-complete",
        userId: "user-1",
        phase: "post_closing",
        documentsReceivedCompleted: true,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(server.fiscalPeriod.archive("fp-open")).rejects.toThrow(
      /cannot archive from phase journalizing/,
    );
    await expect(
      server.fiscalPeriod.archive("fp-no-documents"),
    ).rejects.toThrow(/cannot be archived before documents are received/);

    const archived = await server.fiscalPeriod.archive("fp-complete");
    expect(archived.archiveStatus).toBe("archived");
  });

  it("discards only setup-period records used by failed creation rollback", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-setup",
        userId: "user-1",
        phase: "pre_opening",
        settingsCompleted: false,
      }),
      fiscalPeriod({ id: "fp-started", userId: "user-1" }),
      fiscalPeriod({
        id: "fp-archived",
        userId: "user-1",
        phase: "post_closing",
        archiveStatus: "archived",
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(server.fiscalPeriod.remove("fp-started")).rejects.toThrow(
      /cannot discard from phase journalizing/,
    );
    await expect(server.fiscalPeriod.remove("fp-archived")).rejects.toThrow(
      /Archived fiscal period fp-archived cannot discard/,
    );
    await server.fiscalPeriod.remove("fp-setup");

    expect(await db.fiscalPeriods.getById("fp-setup")).toBeNull();
    expect(await db.fiscalPeriods.getById("fp-started")).not.toBeNull();
    expect(await db.fiscalPeriods.getById("fp-archived")).not.toBeNull();
  });

  it("rejects an opening patch whose opening journal is unbalanced", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingJournals: [
            openingJournal({
              lines: [
                openingLine({ id: "debit", side: "debit", amount: 1000 }),
                openingLine({ id: "credit", side: "credit", amount: 900 }),
              ],
            }),
          ],
        }),
      }),
    ).rejects.toThrow(/Opening journal debit total .* must equal credit total/);
  });

  it("allows a zero-value opening-journal draft only while opening is incomplete", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        phase: "pre_opening",
        settingsCompleted: false,
        openingBalancesCompleted: false,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    const draftOpening = openingPatch({
          openingJournals: [
            {
              id: "draft-journal",
              date: "2026-01-01",
              description: "",
              businessRate: 1,
              lines: [
                {
                  id: "draft-debit",
                  side: "debit",
                  bookAccountId: "acct_cash",
                  amount: 0,
                  partnerName: "",
                  taxCategoryId: "",
                  businessCategoryId: "",
                },
                {
                  id: "draft-credit",
                  side: "credit",
                  bookAccountId: "acct_sales",
                  amount: 0,
                  partnerName: "",
                  taxCategoryId: "",
                  businessCategoryId: "",
                },
              ],
            },
          ],
        });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", { opening: draftOpening }),
    ).resolves.toMatchObject({ opening: draftOpening });
    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        openingBalancesCompleted: true,
      }),
    ).rejects.toThrow(/Opening journal description is required/);
    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        openingBalancesCompleted: true,
        opening: {
          ...draftOpening,
          openingJournals: draftOpening.openingJournals.map((journal) => ({
            ...journal,
            description: "期首再振替",
          })),
        },
      }),
    ).rejects.toThrow(/positive debit and credit lines/);
  });

  it("rejects duplicate opening journal ids before persistence", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });
    const journal = openingJournal({
      lines: [
        openingLine({ id: "d", side: "debit", amount: 1000 }),
        openingLine({ id: "c", side: "credit", amount: 1000 }),
      ],
    });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({ openingJournals: [journal, journal] }),
      }),
    ).rejects.toThrow(/duplicate id/);
  });

  it("rejects oversized opening collections before normalization", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });
    const balanceLine = { id: "line", accountId: "a:現金", amount: 0 };
    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingBalanceLines: Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(
            balanceLine,
          ),
        }),
      }),
    ).rejects.toThrow(/Opening balance lines exceed the 10,000 item limit/);

    const journal = openingJournal({ lines: [] });
    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingJournals: Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(journal),
        }),
      }),
    ).rejects.toThrow(/Opening journals exceed the 10,000 item limit/);
  });

  it("rejects excessive aggregate opening-journal lines", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });
    const line = openingLine({ amount: 0 });
    const lines = Array(MAX_ENTRY_LINES).fill(line);
    const openingJournals = Array.from(
      { length: MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1 },
      (_, index) => openingJournal({ id: `journal-${index}`, lines }),
    );

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({ openingJournals }),
      }),
    ).rejects.toThrow(/Opening journal lines exceed the 100,000 line limit/);
  });

  it("rejects a non-object opening journal without throwing a runtime type error", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingJournals: [
            null as unknown as OpeningPatch["openingJournals"][number],
          ],
        }),
      }),
    ).rejects.toThrow(/Opening journal ids must contain objects/);
  });

  it("rejects an opening patch with a negative opening balance amount", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingBalanceLines: [
            { id: "l1", accountId: "a:現金", amount: -100 },
          ],
        }),
      }),
    ).rejects.toThrow(/Opening balance amount must be a non-negative/);
  });

  it("rejects an opening patch with duplicate opening balance accountIds", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingBalanceLines: [
            { id: "l1", accountId: "a:現金", amount: 100 },
            { id: "l2", accountId: "a:現金", amount: 200 },
          ],
        }),
      }),
    ).rejects.toThrow(/duplicate accountId/);
  });

  it("rejects opening balance IDs without a visible account name", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    for (const accountId of ["a:", "l: 借入金", "x:現金"]) {
      await expect(
        server.fiscalPeriod.patch("fp-user-1", {
          opening: openingPatch({
            openingBalanceLines: [
              { id: `line-${accountId}`, accountId, amount: 100 },
            ],
          }),
        }),
      ).rejects.toThrow(/prefix and a non-blank account name/);
    }
  });

  it("rejects completing unbalanced opening balances", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        openingBalancesCompleted: false,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        openingBalancesCompleted: true,
        opening: openingPatch({
          openingBalanceLines: [
            { id: "asset", accountId: "a:現金", amount: 1000 },
            { id: "liability", accountId: "l:借入金", amount: 900 },
          ],
        }),
      }),
    ).rejects.toThrow(/Opening balances must balance/);
  });

  it("rejects completing opening balances without opening data", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        openingBalancesCompleted: false,
        opening: null,
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        openingBalancesCompleted: true,
      }),
    ).rejects.toThrow(/Completed opening balances require opening data/);
  });

  it("rejects an opening journal outside its fiscal period", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingJournals: [openingJournal({ date: "2027-01-01", lines: [] })],
        }),
      }),
    ).rejects.toThrow(/Opening journal date .* must be within fiscal period/);
  });

  it("rejects overlapping active fiscal periods", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-existing",
        userId: "user-1",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.create({
        name: "overlap",
        startDate: "2026-12-01",
        endDate: "2027-11-30",
      }),
    ).rejects.toThrow(/overlaps active fiscal period fp-existing/);

    expect(await db.fiscalPeriods.getAllByUser("user-1")).toHaveLength(1);
  });

  it("restores an archive as a new active period in its captured phase", async () => {
    const db = createFiscalPeriodDb([]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    const archiveInput = {
      manifest: {
        format: "openkk.fiscal-period-archive",
        version: 1,
        createdAt: "2026-12-31T00:00:00.000Z",
        fiscalPeriodId: "fp-source",
        name: "Archived",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      fiscalPeriod: {
        id: "fp-source",
        name: "Archived",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        phase: "post_closing",
        settingsCompleted: true,
        openingBalancesCompleted: true,
        documentsReceivedCompleted: true,
        opening: {
          openingBalanceLines: [],
          openingJournals: [],
        },
      },
      entries: [],
      fixedAssets: [],
      closings: [
        { fiscalPeriodId: "fp-source", year: 2026, kind: "pre_closing" },
        { fiscalPeriodId: "fp-source", year: 2026, kind: "closing" },
      ],
    };
    const imported = await server.fiscalPeriod.importArchived(archiveInput);

    expect(imported).toMatchObject({
      name: "Archived",
      archiveStatus: "active",
      phase: "post_closing",
    });
    expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([imported]);
    await expect(
      server.fiscalPeriod.importArchived(archiveInput),
    ).rejects.toThrow(/overlaps active fiscal period/);
    expect(await db.fiscalPeriods.getAllByUser("user-1")).toHaveLength(1);
    });
  });

  it("rejects a non-object archive import payload as a validation error", async () => {
    const db = createFiscalPeriodDb([]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.importArchived(
        null as unknown as FiscalPeriodArchiveImportInput,
      ),
    ).rejects.toThrow(/archive must be an object/);
    expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([]);
  });

async function captureAsyncError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to reject");
}

function createFiscalPeriodDb(
  seed: StoredFiscalPeriodApiRecord[],
  childSeed: {
    entries?: EntryApiRecord[];
    fixedAssets?: FixedAssetApiRecord[];
  } = {},
): OpenkkDbPort {
  const fiscalPeriods = new Map(seed.map((period) => [period.id, period]));
  const entries = childSeed.entries ?? [];
  const fixedAssets = childSeed.fixedAssets ?? [];
  return {
    fiscalPeriods: {
      async getAllByUser(userId) {
        return [...fiscalPeriods.values()].filter(
          (period) => period.userId === userId,
        );
      },
      async getById(id) {
        return fiscalPeriods.get(id) ?? null;
      },
      async create(userId: string, input: FiscalPeriodCreateInput) {
        const record = fiscalPeriod({
          id: `fp-${fiscalPeriods.size + 1}`,
          userId,
          ...input,
        });
        fiscalPeriods.set(record.id, record);
        return record;
      },
      async importArchived(
        userId: string,
        input: FiscalPeriodArchiveDbImportInput,
      ) {
        const { opening, ...rest } = input.fiscalPeriod;
        const record = fiscalPeriod({
          id: `fp-${fiscalPeriods.size + 1}`,
          userId,
          ...rest,
          ...(opening != null
            ? {
                opening: {
                  ...opening,
                  createdAt: TEST_TIMESTAMP,
                  updatedAt: TEST_TIMESTAMP,
                },
              }
            : {}),
        });
        fiscalPeriods.set(record.id, record);
        return record;
      },
      async update(id: string, patch: FiscalPeriodPatchInput) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const { opening, ...rest } = patch;
        const updated = fiscalPeriod({
          ...current,
          ...rest,
          ...(opening != null
            ? {
                opening: {
                  ...opening,
                  createdAt: TEST_TIMESTAMP,
                  updatedAt: TEST_TIMESTAMP,
                },
              }
            : {}),
        });
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async archive(id: string) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const updated = fiscalPeriod({ ...current, archiveStatus: "archived" });
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async purgeArchivedData(id: string) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const updated = fiscalPeriod({
          ...current,
          archiveStatus: "archived",
          archiveDataAvailable: false,
        });
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async delete(id) {
        fiscalPeriods.delete(id);
      },
    },
    entries: {
      async getAll(fiscalPeriodId) {
        return entries.filter(
          (record) => record.fiscalPeriodId === fiscalPeriodId,
        );
      },
      async getById() {
        return null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: EntryUpsertInput,
      ) {
        return entry({
          fiscalPeriodId,
          ...input,
          localId: input.localId ?? "",
          lines: entryLinesWithIds(input.lines),
        });
      },
      async update(id: string, input: EntryUpsertInput) {
        return entry({
          id,
          ...input,
          localId: input.localId ?? "",
          lines: entryLinesWithIds(input.lines),
        });
      },
      async delete() {},
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
            localId: input.localId ?? "",
            lines: entryLinesWithIds(input.lines),
          }),
        );
      },
    },
    fixedAssets: {
      async getAllByFiscalPeriod(fiscalPeriodId) {
        return fixedAssets.filter(
          (record) => record.fiscalPeriodId === fiscalPeriodId,
        );
      },
      async getById() {
        return null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: FixedAssetCreateInput,
      ) {
        return fixedAsset({ fiscalPeriodId, ...input });
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, ...changedFields(patch) });
      },
      async delete() {},
    },
    preClosings: {
      async get() {
        return null;
      },
      async run() {
        throw new Error("not implemented");
      },
      async cancel() {
        throw new Error("not implemented");
      },
    },
    closings: {
      async get(): Promise<ClosingApiRecord | null> {
        return null;
      },
      async run() {
        throw new Error("not implemented");
      },
    },
    masterData: {
      async getAllBookAccounts(): Promise<MasterBookAccount[]> {
        return [];
      },
      async getAllTaxCategories(): Promise<MasterTaxCategory[]> {
        return [];
      },
      async getAllBusinessCategories(): Promise<MasterBusinessCategory[]> {
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

function fiscalPeriod(
  overrides: Partial<StoredFiscalPeriodApiRecord>,
): StoredFiscalPeriodApiRecord {
  const base: StoredFiscalPeriodApiRecord = {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: null,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    archiveDataAvailable: null,
    archivedAt: null,
  };
  return Object.assign(base, overrides);
}

type OpeningPatch = NonNullable<FiscalPeriodPatchInput["opening"]>;

function openingPatch(overrides: Partial<OpeningPatch>): OpeningPatch {
  const base: OpeningPatch = {
    id: "op-fp-user-1",
    userId: "user-1",
    fiscalPeriodId: "fp-user-1",
    openingBalanceLines: [],
    openingJournals: [],
  };
  return Object.assign(base, overrides);
}

function openingJournal(
  overrides: Partial<OpeningPatch["openingJournals"][number]>,
): OpeningPatch["openingJournals"][number] {
  return {
    id: "oj-1",
    date: "2026-01-01",
    description: "期首再振替",
    businessRate: 1,
    lines: [],
    ...overrides,
  };
}

function openingLine(
  overrides: Partial<OpeningPatch["openingJournals"][number]["lines"][number]>,
): OpeningPatch["openingJournals"][number]["lines"][number] {
  return {
    id: "ojl-1",
    side: "debit",
    bookAccountId: "acct_cash",
    amount: 0,
    partnerName: "",
    taxCategoryId: "",
    businessCategoryId: "",
    ...overrides,
  };
}

function entry(overrides: Partial<EntryApiRecord>): EntryApiRecord {
  const base: EntryApiRecord = {
    id: "entry-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    description: "entry",
    localId: "",
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
    disposalDate: "",
    disposalPrice: 0,
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
