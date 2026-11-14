import { describe, expect, it } from "vitest";

import {
  AppError,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
} from "@rubydogjp/openkk-engine";
import { createOpenkkBackendApi } from "./index.js";
import type {
  FiscalPeriodArchiveDbImportInput,
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
  OpenkkDbPort,
} from "@rubydogjp/openkk-engine";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodArchiveImportInput,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
} from "./contract.js";
import {
  changedFields,
  entry,
  entryLinesWithIds,
  fiscalPeriod,
  fixedAsset,
} from "../test-support/api-records.js";

describe("backend-api fiscal periods", () => {
  it("rejects invalid fiscal period dates before persisting", async () => {
    const db = createFiscalPeriodDb([]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.create({
        name: "不正な期間",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      }),
    ).rejects.toThrow(/Fiscal period start date must be on or before end date/);

    expect(await db.fiscalPeriods.getAll("user-1")).toEqual([]);
  });

  it("patches only fiscal periods owned by the current user", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        name: "user-1 period",
        phase: "pre_opening",
      }),
      fiscalPeriod({
        id: "fp-user-2",
        userId: "user-2",
        name: "user-2 period",
        phase: "pre_opening",
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-2", {
        name: "updated by user-1",
      }),
    ).rejects.toThrow(/Fiscal period fp-user-2 not found/);

    expect((await db.fiscalPeriods.getById("fp-user-2"))?.name).toBe(
      "user-2 period",
    );

    const updated = await backendApi.fiscalPeriods.patch("fp-user-1", {
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
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", { startDate: "2027-01-01" }),
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
        openingBalancesCompleted: false,
        opening: {
          balanceLines: [],
          journals: [
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", { startDate: "2026-02-01" }),
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch(period.id, { startDate: "2026-02-01" }),
    ).rejects.toThrow(
      /Entry entry-imported date .* must be within fiscal period/,
    );
    expect((await db.fiscalPeriods.getById(period.id))?.startDate).toBe(
      "2026-01-01",
    );
  });

  it("rejects a period range patch that excludes fixed asset dates", async () => {
    const period = fiscalPeriod({
      id: "fp-user-1",
      userId: "user-1",
      phase: "pre_opening",
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch(period.id, { endDate: "2026-10-31" }),
    ).rejects.toThrow(/asset-acquired acquisition date/);
    await expect(
      backendApi.fiscalPeriods.patch(period.id, { startDate: "2026-03-01" }),
    ).rejects.toThrow(/asset-sold disposal date/);
  });

  it("allows a period start after an existing fixed asset acquisition date", async () => {
    const period = fiscalPeriod({
      id: "fp-user-1",
      userId: "user-1",
      phase: "pre_opening",
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch(period.id, { startDate: "2026-02-01" }),
    ).resolves.toMatchObject({ startDate: "2026-02-01" });
  });

  it("rejects null lifecycle fields", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        phase: "pre_opening",
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        openingBalancesCompleted: null,
      } as unknown as FiscalPeriodPatchInput),
    ).rejects.toThrow(/openingBalancesCompleted must be a boolean/);
  });

  it("allows next-period opening balances to be carried before settings start", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        phase: "pre_opening",
        openingBalancesCompleted: false,
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    const updated = await backendApi.fiscalPeriods.patch("fp-user-1", {
      openingBalancesCompleted: true,
      opening: openingPatch({
        balanceLines: [
          { id: "asset", accountId: "a:現金", amount: 1000 },
          { id: "equity", accountId: "l:元入金", amount: 1000 },
        ],
      }),
    });

    expect(updated.phase).toBe("pre_opening");
    expect(updated.openingBalancesCompleted).toBe(true);
  });

  it("rejects setup-field patches after the fiscal period has started", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-started", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-started", { endDate: "2026-11-30" }),
    ).rejects.toThrow(/cannot update endDate from phase journalizing/);
    await expect(backendApi.fiscalPeriods.start("fp-started")).rejects.toThrow(
      /cannot start from phase journalizing/,
    );

    expect((await db.fiscalPeriods.getById("fp-started"))?.endDate).toBe(
      "2026-12-31",
    );
  });

  it("validates carryover application before touching storage", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-source",
        userId: "user-1",
        phase: "post_closing",
        documentsReceivedCompleted: true,
      }),
      fiscalPeriod({
        id: "fp-target",
        userId: "user-1",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      }),
      fiscalPeriod({
        id: "fp-pre-closed",
        userId: "user-1",
        phase: "pre_closing",
        startDate: "2028-01-01",
        endDate: "2028-12-31",
      }),
      fiscalPeriod({
        id: "fp-other-user",
        userId: "user-2",
        phase: "post_closing",
        documentsReceivedCompleted: true,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });
    const input = {
      sourceFiscalPeriodId: "fp-source",
      carryBalances: true,
      reversalEntryIds: null,
      carryFixedAssets: false,
    };

    await expect(
      backendApi.fiscalPeriods.applyCarryover("fp-target", {
        ...input,
        carryBalances: false,
      }),
    ).rejects.toThrow(/at least one item/);
    await expect(
      backendApi.fiscalPeriods.applyCarryover("fp-target", {
        ...input,
        sourceFiscalPeriodId: "fp-target",
      }),
    ).rejects.toThrow(/must differ/);
    await expect(
      backendApi.fiscalPeriods.applyCarryover("fp-pre-closed", input),
    ).rejects.toThrow(/cannot apply carryover from phase pre_closing/);
    await expect(
      backendApi.fiscalPeriods.applyCarryover("fp-target", {
        ...input,
        sourceFiscalPeriodId: "fp-other-user",
      }),
    ).rejects.toThrow(/not found/);
    await expect(
      backendApi.fiscalPeriods.applyCarryover("fp-source", {
        ...input,
        sourceFiscalPeriodId: "fp-target",
      }),
    ).rejects.toThrow(/cannot apply carryover from phase post_closing/);
  });

  it("validates carryover from another book before touching storage", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-target",
        userId: "user-1",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      }),
      fiscalPeriod({
        id: "fp-pre-closed",
        userId: "user-1",
        phase: "pre_closing",
        startDate: "2028-01-01",
        endDate: "2028-12-31",
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });
    const input = {
      archive: {
        manifest: {},
        fiscalPeriod: {},
        entries: [],
        fixedAssets: [],
        closings: [],
      },
      carryBalances: true,
      reversalEntryIndexes: null,
      carryFixedAssets: false,
    };

    await expect(
      backendApi.fiscalPeriods.applyCarryoverFromArchive("fp-target", {
        ...input,
        carryBalances: false,
      }),
    ).rejects.toThrow(/at least one item/);
    await expect(
      backendApi.fiscalPeriods.applyCarryoverFromArchive("fp-target", {
        ...input,
        reversalEntryIndexes: [-1],
      }),
    ).rejects.toThrow(/entry positions/);
    await expect(
      backendApi.fiscalPeriods.applyCarryoverFromArchive("fp-target", {
        ...input,
        reversalEntryIndexes: [0, 0],
      }),
    ).rejects.toThrow(/must be unique/);
    await expect(
      backendApi.fiscalPeriods.applyCarryoverFromArchive(
        "fp-pre-closed",
        input,
      ),
    ).rejects.toThrow(/cannot apply carryover from phase pre_closing/);
    await expect(
      backendApi.fiscalPeriods.applyCarryoverFromArchive("fp-target", input),
    ).rejects.toThrow(/archive manifest/);
  });

  it("rejects patches to a fiscal period whose data was purged", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-purged",
        userId: "user-1",
        archiveStatus: "purged",
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    const error = await captureAsyncError(() =>
      backendApi.fiscalPeriods.patch("fp-purged", { name: "updated" }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "Fiscal period fp-purged cannot be updated after its data was purged",
    );
    expect((error as AppError).messageForUser).toContain("削除済み");
    expect((error as AppError).statusCode).toBe(409);

    expect((await db.fiscalPeriods.getById("fp-purged"))?.name).toBe(
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-closed", {
        name: "renamed after close",
      }),
    ).rejects.toThrow(/only allows document receipt completion after closing/);

    const completed = await backendApi.fiscalPeriods.patch("fp-closed", {
      documentsReceivedCompleted: true,
    });
    expect(completed.documentsReceivedCompleted).toBe(true);
    expect(completed.name).toBe("2026年分");
  });

  it("discards only pre-opening fiscal periods", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-setup",
        userId: "user-1",
        phase: "pre_opening",
      }),
      fiscalPeriod({ id: "fp-started", userId: "user-1" }),
      fiscalPeriod({
        id: "fp-purged",
        userId: "user-1",
        phase: "post_closing",
        archiveStatus: "purged",
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(backendApi.fiscalPeriods.remove("fp-started")).rejects.toThrow(
      /cannot discard from phase journalizing/,
    );
    await expect(backendApi.fiscalPeriods.remove("fp-purged")).rejects.toThrow(
      /Fiscal period fp-purged cannot discard after its data was purged/,
    );
    await backendApi.fiscalPeriods.remove("fp-setup");

    expect(await db.fiscalPeriods.getById("fp-setup")).toBeNull();
    expect(await db.fiscalPeriods.getById("fp-started")).not.toBeNull();
    expect(await db.fiscalPeriods.getById("fp-purged")).not.toBeNull();
  });

  it("rejects an opening patch whose opening journal is unbalanced", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({
          journals: [
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
        openingBalancesCompleted: false,
      }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    const draftOpening = openingPatch({
      journals: [
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
      backendApi.fiscalPeriods.patch("fp-user-1", { opening: draftOpening }),
    ).resolves.toMatchObject({ opening: draftOpening });
    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        openingBalancesCompleted: true,
      }),
    ).rejects.toThrow(/Opening journal description is required/);
    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        openingBalancesCompleted: true,
        opening: {
          ...draftOpening,
          journals: draftOpening.journals.map((journal) => ({
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });
    const journal = openingJournal({
      lines: [
        openingLine({ id: "d", side: "debit", amount: 1000 }),
        openingLine({ id: "c", side: "credit", amount: 1000 }),
      ],
    });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({ journals: [journal, journal] }),
      }),
    ).rejects.toThrow(/duplicate id/);
  });

  it("rejects oversized opening collections before normalization", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });
    const balanceLine = { id: "line", accountId: "a:現金", amount: 0 };
    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({
          balanceLines: Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(balanceLine),
        }),
      }),
    ).rejects.toThrow(/Opening balance lines exceed the 10,000 item limit/);

    const journal = openingJournal({ lines: [] });
    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({
          journals: Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(journal),
        }),
      }),
    ).rejects.toThrow(/Opening journals exceed the 10,000 item limit/);
  });

  it("rejects excessive aggregate opening-journal lines", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });
    const line = openingLine({ amount: 0 });
    const lines = Array(MAX_ENTRY_LINES).fill(line);
    const openingJournals = Array.from(
      { length: MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1 },
      (_, index) => openingJournal({ id: `journal-${index}`, lines }),
    );

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({ journals: openingJournals }),
      }),
    ).rejects.toThrow(/Opening journal lines exceed the 100,000 line limit/);
  });

  it("rejects a non-object opening journal without throwing a runtime type error", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({
          journals: [null as unknown as OpeningPatch["journals"][number]],
        }),
      }),
    ).rejects.toThrow(/Opening journal must be an object/);
  });

  it("rejects an opening patch with a negative opening balance amount", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({
          balanceLines: [{ id: "l1", accountId: "a:現金", amount: -100 }],
        }),
      }),
    ).rejects.toThrow(/Opening balance line amount must be a non-negative/);
  });

  it("rejects an opening patch with duplicate opening balance accountIds", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({
          balanceLines: [
            { id: "l1", accountId: "a:現金", amount: 100 },
            { id: "l2", accountId: "a:現金", amount: 200 },
          ],
        }),
      }),
    ).rejects.toThrow(/Opening balance accountId has a duplicate value/);
  });

  it("rejects opening balance IDs without a visible account name", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    for (const accountId of ["a:", "l: 借入金", "x:現金"]) {
      await expect(
        backendApi.fiscalPeriods.patch("fp-user-1", {
          opening: openingPatch({
            balanceLines: [{ id: `line-${accountId}`, accountId, amount: 100 }],
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        openingBalancesCompleted: true,
        opening: openingPatch({
          balanceLines: [
            { id: "asset", accountId: "a:現金", amount: 1000 },
            { id: "liability", accountId: "l:借入金", amount: 900 },
          ],
        }),
      }),
    ).rejects.toThrow(/Opening balances must balance/);
  });

  it("rejects an opening journal outside its fiscal period", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.patch("fp-user-1", {
        opening: openingPatch({
          journals: [openingJournal({ date: "2027-01-01", lines: [] })],
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
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    await expect(
      backendApi.fiscalPeriods.create({
        name: "overlap",
        startDate: "2026-12-01",
        endDate: "2027-11-30",
      }),
    ).rejects.toThrow(/overlaps active fiscal period fp-existing/);

    expect(await db.fiscalPeriods.getAll("user-1")).toHaveLength(1);
  });

  it("restores an archive as a new active period in its captured phase", async () => {
    const db = createFiscalPeriodDb([]);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

    const archiveInput = {
      manifest: {
        format: "openkk.fiscal-period-archive",
        version: 2,
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
        openingBalancesCompleted: true,
        documentsReceivedCompleted: true,
        opening: {
          balanceLines: [],
          journals: [],
        },
      },
      entries: [],
      fixedAssets: [],
      closings: [
        { fiscalPeriodId: "fp-source", year: 2026, kind: "pre_closing" },
        { fiscalPeriodId: "fp-source", year: 2026, kind: "closing" },
      ],
    };
    const imported =
      await backendApi.fiscalPeriods.importArchived(archiveInput);

    expect(imported).toMatchObject({
      name: "Archived",
      archiveStatus: "active",
      phase: "post_closing",
    });
    expect(await db.fiscalPeriods.getAll("user-1")).toEqual([imported]);
    await expect(
      backendApi.fiscalPeriods.importArchived(archiveInput),
    ).rejects.toThrow(/overlaps active fiscal period/);
    expect(await db.fiscalPeriods.getAll("user-1")).toHaveLength(1);
  });
});

it("rejects a non-object archive import payload as a validation error", async () => {
  const db = createFiscalPeriodDb([]);
  const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });

  await expect(
    backendApi.fiscalPeriods.importArchived(
      null as unknown as FiscalPeriodArchiveImportInput,
    ),
  ).rejects.toThrow(/archive must be an object/);
  expect(await db.fiscalPeriods.getAll("user-1")).toEqual([]);
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
  seed: FiscalPeriodApiRecord[],
  childSeed: Partial<{
    entries: EntryApiRecord[];
    fixedAssets: FixedAssetApiRecord[];
  }> = {},
): OpenkkDbPort {
  const fiscalPeriods = new Map(seed.map((period) => [period.id, period]));
  const entries = childSeed.entries ?? [];
  const fixedAssets = childSeed.fixedAssets ?? [];
  return {
    fiscalPeriods: {
      async getAll(userId) {
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
      async createNext() {
        throw new Error("unexpected createNext call");
      },
      async applyCarryover() {
        throw new Error("unexpected applyCarryover call");
      },
      async applyCarryoverFromArchive() {
        throw new Error("unexpected applyCarryoverFromArchive call");
      },
      async importArchived(
        userId: string,
        input: FiscalPeriodArchiveDbImportInput,
      ) {
        const { opening, ...rest } = input.fiscalPeriod;
        const id = `fp-${fiscalPeriods.size + 1}`;
        const record = fiscalPeriod({
          id,
          userId,
          ...rest,
          opening: {
            balanceLines: opening?.balanceLines ?? [],
            journals: opening?.journals ?? [],
          },
        });
        fiscalPeriods.set(record.id, record);
        return record;
      },
      async patch(id: string, patch: FiscalPeriodPatchInput) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const { opening, ...rest } = patch;
        const updated = fiscalPeriod({
          ...current,
          ...rest,
          ...(opening != null
            ? {
                opening: {
                  ...current.opening,
                  ...opening,
                },
              }
            : {}),
        });
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async start(id: string) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const updated = fiscalPeriod({ ...current, phase: "journalizing" });
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async remove(id) {
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
          localId: input.localId,
          lines: entryLinesWithIds(input.lines),
        });
      },
      async update(id: string, input: EntryUpsertInput) {
        return entry({
          id,
          ...input,
          localId: input.localId,
          lines: entryLinesWithIds(input.lines),
        });
      },
      async remove() {},
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
      async getAll(fiscalPeriodId) {
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
      async patch(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, ...changedFields(patch) });
      },
      async remove() {},
    },
    preClosings: {
      async run() {
        throw new Error("not implemented");
      },
      async cancel() {
        throw new Error("not implemented");
      },
    },
    closings: {
      async run() {
        throw new Error("not implemented");
      },
    },
    masterData: {
      async getBookAccounts(): Promise<MasterBookAccountDbRecord[]> {
        return [];
      },
      async getTaxCategories(): Promise<MasterTaxCategoryDbRecord[]> {
        return [];
      },
      async getBusinessCategories(): Promise<MasterBusinessCategoryDbRecord[]> {
        return [];
      },
    },
  };
}

type OpeningPatch = NonNullable<FiscalPeriodPatchInput["opening"]>;

function openingPatch(overrides: Partial<OpeningPatch>): OpeningPatch {
  const base: OpeningPatch = {
    balanceLines: [],
    journals: [],
  };
  return Object.assign(base, overrides);
}

function openingJournal(
  overrides: Partial<OpeningPatch["journals"][number]>,
): OpeningPatch["journals"][number] {
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
  overrides: Partial<OpeningPatch["journals"][number]["lines"][number]>,
): OpeningPatch["journals"][number]["lines"][number] {
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
