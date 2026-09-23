import { describe, expect, it } from "vitest";

import {
  AppError,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES,
} from "@rubydogjp/openkk-server-domain";
import type { FiscalPeriodArchiveImportInput } from "@rubydogjp/openkk-server-ports";
import { normalizeArchiveImportInput } from "./archive-import.js";

describe("normalizeArchiveImportInput", () => {
  it("normalizes archived fiscal period payload for db import", () => {
    const input = validArchiveInput();
    const normalized = normalizeArchiveImportInput(input);

    expect(normalized.fiscalPeriod).toMatchObject({
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      phase: "post_closing",
      settingsCompleted: true,
      openingBalancesCompleted: true,
      documentsReceivedCompleted: true,
    });
    expect(normalized.entries).toEqual([
      {
        date: "2026-04-01",
        description: "売上",
        localId: null,
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "",
            businessCategoryId: "",
          },
          {
            side: "credit",
            bookAccountId: "acct_sales",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "",
            businessCategoryId: "",
          },
        ],
      },
    ]);
    expect(normalized.fixedAssets[0]).toMatchObject({
      name: "PC",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 240000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 0.5,
      bookAccountId: "acct_equipment",
      status: "sold",
      disposalDate: "2026-12-01",
      disposalPrice: 120000,
    });
    expect(normalized.preClosings).toEqual([{ year: 2026 }]);
    expect(normalized.closings).toEqual([{ year: 2026 }]);
  });

  it.each([
    "pre_opening",
    "journalizing",
    "pre_closing",
    "post_closing",
  ] as const)(
    "restores an archive captured in %s as an active period",
    (phase) => {
      const input = validArchiveInput();
      configureArchivePhase(input, phase);

      const normalized = normalizeArchiveImportInput(input);

      expect(normalized.fiscalPeriod.phase).toBe(phase);
    },
  );

  it("restores carried opening balances before next-period settings start", () => {
    const input = validArchiveInput();
    configureArchivePhase(input, "pre_opening");
    input.fiscalPeriod.openingBalancesCompleted = true;

    const normalized = normalizeArchiveImportInput(input);

    expect(normalized.fiscalPeriod).toMatchObject({
      phase: "pre_opening",
      settingsCompleted: false,
      openingBalancesCompleted: true,
    });
    expect(normalized.fiscalPeriod.opening).toBeDefined();
  });

  it("rejects completed opening balances without opening data", () => {
    const input = validArchiveInput();
    configureArchivePhase(input, "pre_opening");
    input.fiscalPeriod.openingBalancesCompleted = true;
    input.fiscalPeriod.opening = null;

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /completed opening balances require opening data/,
    );
  });

  it("rejects fiscal period id mismatch", () => {
    const input = validArchiveInput();
    input.fiscalPeriod.id = "another-period";

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive fiscalPeriod id does not match manifest",
    );
    expect((error as AppError).messageForUser).toContain("入力内容");
    expect((error as AppError).statusCode).toBe(400);
  });

  it("rejects invalid fiscal period date ranges", () => {
    const input = validArchiveInput();
    input.fiscalPeriod.startDate = "2027-01-01";

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive fiscalPeriod start date must be on or before end date",
    );
  });

  it("rejects invalid archived entry dates", () => {
    const input = validArchiveInput();
    input.entries[0]!.date = "2026-02-29";

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entry.date is invalid",
    );
  });

  it("rejects archived entries outside the fiscal period", () => {
    const input = validArchiveInput();
    input.entries[0]!.date = "2027-01-01";

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /archive entry date 2027-01-01 must be within fiscal period/,
    );
  });

  it("rejects malformed top-level archive collections", () => {
    const input = validArchiveInput();
    (input as unknown as { entries: unknown }).entries = undefined;

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entries must be an array",
    );

    expect(() =>
      normalizeArchiveImportInput(
        null as unknown as FiscalPeriodArchiveImportInput,
      ),
    ).toThrow(/archive must be an object/);
  });

  it("accepts archive collections larger than a single entry import batch", () => {
    const input = validArchiveInput();
    input.entries = Array.from({ length: MAX_ENTRY_IMPORT_ITEMS + 1 }, (_, index) => ({
      ...input.entries[0],
      id: `entry-${index}`,
    }));
    input.fixedAssets = Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(input.fixedAssets[0]);
    const result = normalizeArchiveImportInput(input);
    expect(result.entries).toHaveLength(MAX_ENTRY_IMPORT_ITEMS + 1);
    expect(result.fixedAssets).toHaveLength(MAX_ENTRY_IMPORT_ITEMS + 1);
  });

  it("rejects oversized archive sections before normalization", () => {
    const input = validArchiveInput();
    input.entries[0]!.description = "資".repeat(Math.ceil(MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES / 3));
    expect(() => normalizeArchiveImportInput(input)).toThrow(/size limit/);
  });

  it("rejects excessive closing records", () => {
    const input = validArchiveInput();
    input.closings = Array(3).fill(input.closings[0]);
    expect(() => normalizeArchiveImportInput(input)).toThrow(/closings exceeds the 2 item limit/);
  });

  it("rejects non-boolean lifecycle flags instead of silently clearing them", () => {
    const input = validArchiveInput();
    input.fiscalPeriod.settingsCompleted = "true";

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /settingsCompleted must be a boolean/,
    );
  });

  it("rejects non-object items in archive collections", () => {
    const input = validArchiveInput();
    (input.entries as unknown[])[0] = null;

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entry must be an object",
    );
  });

  it("rejects wrong types in entry-line strings", () => {
    const invalidPartner = validArchiveInput();
    const partnerLine = (
      invalidPartner.entries[0] as { lines: Array<Record<string, unknown>> }
    ).lines[0]!;
    partnerLine.partnerName = { corrupted: true };
    expect(() =>
      normalizeArchiveImportInput(invalidPartner),
    ).toThrow(/entry\.line\.partnerName must be a string/);

    const invalidCategory = validArchiveInput();
    const categoryLine = (
      invalidCategory.entries[0] as { lines: Array<Record<string, unknown>> }
    ).lines[0]!;
    categoryLine.taxCategoryId = 10;
    expect(() =>
      normalizeArchiveImportInput(invalidCategory),
    ).toThrow(/entry\.line\.taxCategoryId must be a string/);
  });

  it("rejects wrong types instead of applying legacy archive defaults", () => {
    const invalidLocalId = validArchiveInput();
    invalidLocalId.entries[0]!.localId = 123;
    expect(() =>
      normalizeArchiveImportInput(invalidLocalId),
    ).toThrow(/entry\.localId must be a string or null/);

    const invalidLineId = validArchiveInput();
    const openingLine = archiveOpening(invalidLineId).openingJournals[0]!
      .lines[0]! as { id: unknown };
    openingLine.id = { corrupted: true };
    expect(() =>
      normalizeArchiveImportInput(invalidLineId),
    ).toThrow(/openingJournal\.line\.id must be a string/);

    const invalidStatus = validArchiveInput();
    invalidStatus.fixedAssets[0]!.status = 1;
    expect(() =>
      normalizeArchiveImportInput(invalidStatus),
    ).toThrow(/fixedAsset\.status must be a string/);
  });

  it("requires version 2 fields to be explicit", () => {
    const missingOpening = validArchiveInput();
    delete missingOpening.fiscalPeriod.opening;
    expect(() =>
      normalizeArchiveImportInput(missingOpening),
    ).toThrow(/opening must be null or an object/);

    const missingLocalId = validArchiveInput();
    delete missingLocalId.entries[0]!.localId;
    expect(() =>
      normalizeArchiveImportInput(missingLocalId),
    ).toThrow(/entry\.localId must be a string or null/);

    const missingLineMetadata = validArchiveInput();
    delete (
      missingLineMetadata.entries[0]!.lines as Array<
        Record<string, unknown>
      >
    )[0]!.partnerName;
    expect(() =>
      normalizeArchiveImportInput(missingLineMetadata),
    ).toThrow(/entry\.line\.partnerName must be a string/);

    const missingStatus = validArchiveInput();
    delete missingStatus.fixedAssets[0]!.status;
    expect(() =>
      normalizeArchiveImportInput(missingStatus),
    ).toThrow(/fixedAsset\.status must be a string/);
  });

  it("rejects invalid fixed asset values", () => {
    const input = validArchiveInput();
    input.fixedAssets[0]!.usefulLife = 0;

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive fixedAsset.usefulLife must be a positive integer",
    );

    const zeroCost = validArchiveInput();
    zeroCost.fixedAssets[0]!.acquisitionCost = 0;
    expect(() => normalizeArchiveImportInput(zeroCost)).toThrow(
      /archive fixedAsset.acquisitionCost must be a positive integer/,
    );
  });

  it("rejects fractional-yen monetary values", () => {
    const input = validArchiveInput();
    input.entries[0]!.lines = (
      input.entries[0]!.lines as Array<Record<string, unknown>>
    ).map((line) => ({ ...line, amount: 1000.5 }));

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /safe integer/,
    );
  });

  it("rejects inconsistent archived fixed asset disposal data", () => {
    const missingDate = validArchiveInput();
    delete missingDate.fixedAssets[0]!.disposalDate;
    expect(() => normalizeArchiveImportInput(missingDate)).toThrow(
      /disposalDate must be a string/,
    );

    const beforeAcquisition = validArchiveInput();
    beforeAcquisition.fixedAssets[0]!.disposalDate = "2026-03-31";
    expect(() =>
      normalizeArchiveImportInput(beforeAcquisition),
    ).toThrow(/disposal date 2026-03-31 must not be before acquisition date/);
  });

  it("rejects unsupported depreciation methods and active disposal data", () => {
    const invalidMethod = validArchiveInput();
    invalidMethod.fixedAssets[0]!.depreciationMethod = "declining_balance";
    expect(() =>
      normalizeArchiveImportInput(invalidMethod),
    ).toThrow(/depreciationMethod is invalid/);

    const activeDisposal = validArchiveInput();
    activeDisposal.fixedAssets[0]!.status = "active";
    expect(() =>
      normalizeArchiveImportInput(activeDisposal),
    ).toThrow(/Fixed asset with status active must not have a disposal date/);

    const retiredDisposal = validArchiveInput();
    retiredDisposal.fixedAssets[0]!.status = "retired";
    expect(() =>
      normalizeArchiveImportInput(retiredDisposal),
    ).toThrow(/Fixed asset with status retired must not have a disposal date/);

    const prematureRetirement = validArchiveInput();
    prematureRetirement.fixedAssets[0]!.status = "retired";
    prematureRetirement.fixedAssets[0]!.disposalDate = null;
    prematureRetirement.fixedAssets[0]!.disposalPrice = null;
    expect(() =>
      normalizeArchiveImportInput(prematureRetirement),
    ).toThrow(/cannot be retired before it reaches memorandum value/);

    const disposedPrice = validArchiveInput();
    disposedPrice.fixedAssets[0]!.status = "disposed";
    expect(() =>
      normalizeArchiveImportInput(disposedPrice),
    ).toThrow(/Fixed asset with status disposed must not have a disposal price/);
  });

  it("rejects an unknown archived closing kind", () => {
    const input = validArchiveInput();
    input.closings = [
      { fiscalPeriodId: "period-1", year: 2026, kind: "unexpected" },
    ];

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /archive closing.kind is invalid/,
    );
  });

  it("rejects mismatched or duplicate archived closing records", () => {
    const wrongYear = validArchiveInput();
    wrongYear.closings = [
      { fiscalPeriodId: "period-1", year: 2025, kind: "closing" },
    ];
    expect(() => normalizeArchiveImportInput(wrongYear)).toThrow(
      /must match fiscal period end year 2026/,
    );

    const duplicate = validArchiveInput();
    duplicate.closings = [
      { fiscalPeriodId: "period-1", year: 2026, kind: "closing" },
      { fiscalPeriodId: "period-1", year: 2026, kind: "closing" },
    ];
    expect(() => normalizeArchiveImportInput(duplicate)).toThrow(
      /archive closing has a duplicate value/,
    );
  });

  it("rejects duplicate archived entry localIds and keeps null ones", () => {
    const duplicate = validArchiveInput();
    const entry = duplicate.entries[0]!;
    duplicate.entries = [
      { ...entry, localId: "source-entry-1" },
      { ...entry, localId: "source-entry-1" },
    ];
    expect(() => normalizeArchiveImportInput(duplicate)).toThrow(
      /archive entry.localId has a duplicate value/,
    );

    const withoutLocalIds = validArchiveInput();
    withoutLocalIds.entries = [
      { ...entry, localId: null },
      { ...entry, localId: null },
    ];
    expect(
      normalizeArchiveImportInput(withoutLocalIds).entries.map(
        (record) => record.localId,
      ),
    ).toEqual([null, null]);
  });

  it("rejects lifecycle flags and closing records inconsistent with phase", () => {
    const missingPreClosing = validArchiveInput();
    missingPreClosing.closings = [
      { fiscalPeriodId: "period-1", year: 2026, kind: "closing" },
    ];
    expect(() =>
      normalizeArchiveImportInput(missingPreClosing),
    ).toThrow(/post_closing phase requires pre-closing and closing records/);

    const prematureDocuments = validArchiveInput();
    configureArchivePhase(prematureDocuments, "journalizing");
    prematureDocuments.fiscalPeriod.documentsReceivedCompleted = true;
    expect(() =>
      normalizeArchiveImportInput(prematureDocuments),
    ).toThrow(/documentsReceivedCompleted requires post_closing/);
  });

  it("rejects an unbalanced archived opening journal", () => {
    const input = validArchiveInput();
    archiveOpening(input).openingJournals[0]!.lines[1]!.amount = 900;

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive openingJournal debit total",
    );
  });

  it("restores a balanced zero-value opening-journal draft", () => {
    const input = validArchiveInput();
    configureArchivePhase(input, "pre_opening");
    const journal = (
      input.fiscalPeriod.opening as {
        openingJournals: Array<{
          description: string;
          lines: Array<{ amount: number }>;
        }>;
      }
    ).openingJournals[0]!;
    journal.description = "";
    journal.lines.forEach((line) => {
      line.amount = 0;
    });

    const normalized = normalizeArchiveImportInput(input);

    expect(normalized.fiscalPeriod.opening.openingJournals[0]).toMatchObject({
      description: "",
      lines: [{ amount: 0 }, { amount: 0 }],
    });
  });

  it("restores incomplete opening-balance drafts without forcing them to balance", () => {
    const input = validArchiveInput();
    configureArchivePhase(input, "pre_opening");
    archiveOpening(input).openingBalanceLines[1]!.amount = 900;

    const normalized = normalizeArchiveImportInput(input);

    expect(normalized.fiscalPeriod.opening.openingBalanceLines).toEqual([
      { id: "cash", accountId: "a:現金", amount: 1000 },
      { id: "capital", accountId: "l:元入金", amount: 900 },
    ]);
  });

  it("requires opening data and finalized journals whenever opening balances are completed", () => {
    const missingOpening = validArchiveInput();
    configureArchivePhase(missingOpening, "journalizing");
    missingOpening.fiscalPeriod.openingBalancesCompleted = true;
    missingOpening.fiscalPeriod.opening = null;
    expect(() =>
      normalizeArchiveImportInput(missingOpening),
    ).toThrow(/completed opening balances require opening data/);

    const zeroJournal = validArchiveInput();
    configureArchivePhase(zeroJournal, "pre_opening");
    zeroJournal.fiscalPeriod.openingBalancesCompleted = true;
    archiveOpening(zeroJournal).openingJournals[0]!.lines.forEach((line) => {
      line.amount = 0;
    });
    expect(() => normalizeArchiveImportInput(zeroJournal)).toThrow(
      /positive debit and credit lines/,
    );

    const blankDescription = validArchiveInput();
    configureArchivePhase(blankDescription, "pre_opening");
    blankDescription.fiscalPeriod.openingBalancesCompleted = true;
    archiveOpening(blankDescription).openingJournals[0]!.description = "";
    expect(() =>
      normalizeArchiveImportInput(blankDescription),
    ).toThrow(/description is required/);
  });

  it("rejects an unbalanced archived entry", () => {
    const input = validArchiveInput();
    (input.entries[0]!.lines as Array<{ amount: number }>)[1]!.amount = 900;

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entry debit total",
    );
  });

  it("rejects a negative archived opening balance amount", () => {
    const input = validArchiveInput();
    archiveOpening(input).openingBalanceLines[0]!.amount = -100;

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive openingBalanceLine.amount",
    );
  });

  it("rejects duplicate archived opening balance accountIds", () => {
    const input = validArchiveInput();
    archiveOpening(input).openingBalanceLines.push({
      id: "cash-2",
      accountId: "a:現金",
      amount: 500,
    });

    const error = captureError(() =>
      normalizeArchiveImportInput(input),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive openingBalanceLine accountId has a duplicate value",
    );
  });

  it("rejects an archived opening balance without a visible account name", () => {
    const input = validArchiveInput();
    archiveOpening(input).openingBalanceLines[0]!.accountId = "a:   ";

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /prefix and a non-blank account name/,
    );
  });

  it("rejects duplicate opening record IDs before reaching SQLite", () => {
    const duplicateBalanceId = validArchiveInput();
    archiveOpening(duplicateBalanceId).openingBalanceLines[1]!.id = "cash";
    expect(() =>
      normalizeArchiveImportInput(duplicateBalanceId),
    ).toThrow(/openingBalanceLines has a duplicate id/);

    const duplicateJournalId = validArchiveInput();
    const opening = archiveOpening(duplicateJournalId);
    opening.openingJournals.push({
      ...opening.openingJournals[0]!,
      lines: opening.openingJournals[0]!.lines.map((line) => ({ ...line })),
    });
    expect(() =>
      normalizeArchiveImportInput(duplicateJournalId),
    ).toThrow(/openingJournals has a duplicate id/);

    const duplicateLineId = validArchiveInput();
    const journal = archiveOpening(duplicateLineId).openingJournals[0]!;
    journal.lines[0]!.id = "same-line";
    journal.lines[1]!.id = "same-line";
    expect(() =>
      normalizeArchiveImportInput(duplicateLineId),
    ).toThrow(/lines has a duplicate id/);
  });

  it("normalizes category display names from legacy archives to master IDs", () => {
    const input = validArchiveInput();
    input.manifest.version = 1;
    const lines = input.entries[0]!.lines as Array<Record<string, unknown>>;
    lines[0]!.taxCategoryId = "課税 10%";
    lines[0]!.businessCategoryId = "第5種（サービス業等）";

    const normalized = normalizeArchiveImportInput(input);

    expect(normalized.entries[0]?.lines[0]).toMatchObject({
      taxCategoryId: "tax_10",
      businessCategoryId: "biz_5",
    });
  });

  it("preserves custom category values from archives", () => {
    const input = validArchiveInput();
    const lines = input.entries[0]!.lines as Array<Record<string, unknown>>;
    lines[0]!.taxCategoryId = "custom-tax";
    lines[0]!.businessCategoryId = "custom-business";

    const normalized = normalizeArchiveImportInput(input);

    expect(normalized.entries[0]?.lines[0]).toMatchObject({
      taxCategoryId: "custom-tax",
      businessCategoryId: "custom-business",
    });
  });

  it("validates master references even when a legacy entry has no identifier", () => {
    const input = validArchiveInput();
    input.manifest.version = 1;
    delete input.entries[0]!.id;
    delete input.entries[0]!.localId;
    const lines = input.entries[0]!.lines as Array<Record<string, unknown>>;
    lines[0]!.bookAccountId = "unknown-account";

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /archive entry line references unknown book account/,
    );
  });

  it("rejects child records that identify a different fiscal period", () => {
    const input = validArchiveInput();
    input.entries[0]!.fiscalPeriodId = "another-period";

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /entry\.fiscalPeriodId does not match archive fiscalPeriod/,
    );
  });

  it("reads legacy fixed asset disposal sentinels as null", () => {
    const input = validArchiveInput();
    input.manifest.version = 1;
    input.fixedAssets[0]!.status = "active";
    input.fixedAssets[0]!.disposalDate = "";
    input.fixedAssets[0]!.disposalPrice = 0;

    const normalized = normalizeArchiveImportInput(input);

    expect(normalized.fixedAssets[0]).toMatchObject({
      status: "active",
      disposalDate: null,
      disposalPrice: null,
    });
  });

  it("rejects fixed asset useful lives beyond the supported calculation range", () => {
    const input = validArchiveInput();
    input.fixedAssets[0]!.usefulLife = 101;

    expect(() => normalizeArchiveImportInput(input)).toThrow(
      /useful life must not exceed 100 years/,
    );
  });
});

type ArchiveOpeningView = {
  openingBalanceLines: Array<{ id: string; accountId: string; amount: number }>;
  openingJournals: Array<{
    id: string;
    description: string;
    lines: Array<{ id: string; amount: number }>;
  }>;
};

function archiveOpening(
  input: FiscalPeriodArchiveImportInput,
): ArchiveOpeningView {
  return input.fiscalPeriod.opening as ArchiveOpeningView;
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}

function validArchiveInput(): FiscalPeriodArchiveImportInput {
  return {
    manifest: {
      format: "openkk.fiscal-period-archive",
      version: 2,
      createdAt: "2026-12-31T00:00:00.000Z",
      fiscalPeriodId: "period-1",
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    },
    fiscalPeriod: {
      id: "period-1",
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      phase: "post_closing",
      settingsCompleted: true,
      openingBalancesCompleted: true,
      documentsReceivedCompleted: true,
      opening: {
        openingBalanceLines: [
          {
            id: "cash",
            accountId: "a:現金",
            amount: 1000,
          },
          {
            id: "capital",
            accountId: "l:元入金",
            amount: 1000,
          },
        ],
        openingJournals: [
          {
            id: "carry-1",
            date: "2026-01-01",
            description: "再振替",
            businessRate: 1,
            lines: [
              {
                id: "carry-1-line-1",
                side: "debit",
                bookAccountId: "acct_cash",
                amount: 1000,
                partnerName: "",
                taxCategoryId: "",
                businessCategoryId: "",
              },
              {
                id: "carry-1-line-2",
                side: "credit",
                bookAccountId: "acct_sales",
                amount: 1000,
                partnerName: "",
                taxCategoryId: "",
                businessCategoryId: "",
              },
            ],
          },
        ],
      },
    },
    entries: [
      {
        id: "entry-1",
        fiscalPeriodId: "period-1",
        date: "2026-04-01",
        description: "売上",
        localId: null,
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "",
            businessCategoryId: "",
          },
          {
            side: "credit",
            bookAccountId: "acct_sales",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "",
            businessCategoryId: "",
          },
        ],
      },
    ],
    fixedAssets: [
      {
        fiscalPeriodId: "period-1",
        name: "PC",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 240000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 0.5,
        bookAccountId: "acct_equipment",
        status: "sold",
        disposalDate: "2026-12-01",
        disposalPrice: 120000,
      },
    ],
    closings: [
      { fiscalPeriodId: "period-1", year: 2026, kind: "pre_closing" },
      { fiscalPeriodId: "period-1", year: 2026, kind: "closing" },
    ],
  };
}

function configureArchivePhase(
  input: FiscalPeriodArchiveImportInput,
  phase: "pre_opening" | "journalizing" | "pre_closing" | "post_closing",
) {
  input.fiscalPeriod.phase = phase;
  input.fiscalPeriod.settingsCompleted = phase !== "pre_opening";
  input.fiscalPeriod.openingBalancesCompleted =
    phase === "pre_closing" || phase === "post_closing";
  input.fiscalPeriod.documentsReceivedCompleted = phase === "post_closing";
  input.closings =
    phase === "pre_closing"
      ? [
          {
            fiscalPeriodId: "period-1",
            year: 2026,
            kind: "pre_closing",
          },
        ]
      : phase === "post_closing"
        ? [
            {
              fiscalPeriodId: "period-1",
              year: 2026,
              kind: "pre_closing",
            },
            {
              fiscalPeriodId: "period-1",
              year: 2026,
              kind: "closing",
            },
          ]
        : [];
}
