import { describe, expect, it } from "vitest";

import { AppError } from "@rubydogjp/openkk-server-domain";
import type { FiscalPeriodArchiveImportInput } from "@rubydogjp/openkk-server-ports";
import { normalizeArchiveImportInput } from "./archive-import.js";

describe("normalizeArchiveImportInput", () => {
  it("normalizes archived fiscal period payload for db import", () => {
    const input = validArchiveInput();
    const normalized = normalizeArchiveImportInput(input, "user-1");

    expect(normalized.fiscalPeriod).toMatchObject({
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      phase: "post_closing",
      archiveStatus: "active",
      settingsCompleted: true,
      openingBalancesCompleted: true,
      documentsReceivedCompleted: true,
    });
    expect(normalized.fiscalPeriod.opening?.userId).toBe("user-1");
    expect(normalized.entries).toEqual([
      {
        date: "2026-04-01",
        description: "売上",
        localId: "archive:entry-1",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "cash",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "",
            businessCategoryId: "",
          },
          {
            side: "credit",
            bookAccountId: "sales",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "",
            businessCategoryId: "",
          },
        ],
      },
    ]);
    expect(normalized.fixedAssets[0]).toMatchObject({
      createInput: {
        name: "PC",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 240000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 0.5,
        bookAccountId: "tools",
      },
      patchInput: {
        status: "sold",
        disposalDate: "2026-12-01",
        disposalPrice: 120000,
      },
    });
    expect(normalized.preClosings).toEqual([]);
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
      input.fiscalPeriod.phase = phase;

      const normalized = normalizeArchiveImportInput(input, "user-1");

      expect(normalized.fiscalPeriod.phase).toBe(phase);
      expect(normalized.fiscalPeriod.archiveStatus).toBe("active");
    },
  );

  it("rejects fiscal period id mismatch", () => {
    const input = validArchiveInput();
    input.fiscalPeriod.id = "another-period";

    const error = captureError(() =>
      normalizeArchiveImportInput(input, "user-1"),
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
      normalizeArchiveImportInput(input, "user-1"),
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
      normalizeArchiveImportInput(input, "user-1"),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entry.date is invalid",
    );
  });

  it("rejects archived entries outside the fiscal period", () => {
    const input = validArchiveInput();
    input.entries[0]!.date = "2027-01-01";

    expect(() => normalizeArchiveImportInput(input, "user-1")).toThrow(
      /archive entry.date must be within fiscal period/,
    );
  });

  it("rejects malformed top-level archive collections", () => {
    const input = validArchiveInput();
    (input as unknown as { entries: unknown }).entries = undefined;

    const error = captureError(() =>
      normalizeArchiveImportInput(input, "user-1"),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entries must be an array",
    );
  });

  it("rejects non-object items in archive collections", () => {
    const input = validArchiveInput();
    (input.entries as unknown[])[0] = null;

    const error = captureError(() =>
      normalizeArchiveImportInput(input, "user-1"),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entry must be an object",
    );
  });

  it("rejects invalid fixed asset values", () => {
    const input = validArchiveInput();
    input.fixedAssets[0]!.usefulLife = 0;

    const error = captureError(() =>
      normalizeArchiveImportInput(input, "user-1"),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive fixedAsset.usefulLife must be a positive integer",
    );
  });

  it("rejects inconsistent archived fixed asset disposal data", () => {
    const missingDate = validArchiveInput();
    delete missingDate.fixedAssets[0]!.disposalDate;
    expect(() => normalizeArchiveImportInput(missingDate, "user-1")).toThrow(
      /requires disposalDate/,
    );

    const beforeAcquisition = validArchiveInput();
    beforeAcquisition.fixedAssets[0]!.disposalDate = "2026-03-31";
    expect(() =>
      normalizeArchiveImportInput(beforeAcquisition, "user-1"),
    ).toThrow(/must not be before acquisitionDate/);
  });

  it("rejects an unknown archived closing kind", () => {
    const input = validArchiveInput();
    input.closings = [{ year: 2026, kind: "unexpected" }];

    expect(() => normalizeArchiveImportInput(input, "user-1")).toThrow(
      /archive closing.kind is invalid/,
    );
  });

  it("rejects mismatched or duplicate archived closing records", () => {
    const wrongYear = validArchiveInput();
    wrongYear.closings = [{ year: 2025, kind: "closing" }];
    expect(() => normalizeArchiveImportInput(wrongYear, "user-1")).toThrow(
      /must match fiscal period end year 2026/,
    );

    const duplicate = validArchiveInput();
    duplicate.closings = [
      { year: 2026, kind: "closing" },
      { year: 2026, kind: "closing" },
    ];
    expect(() => normalizeArchiveImportInput(duplicate, "user-1")).toThrow(
      /archive closing is duplicated/,
    );
  });

  it("rejects an unbalanced archived opening journal", () => {
    const input = validArchiveInput();
    archiveOpening(input).openingJournals[0]!.lines[1]!.amount = 900;

    const error = captureError(() =>
      normalizeArchiveImportInput(input, "user-1"),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive openingJournal debit total",
    );
  });

  it("restores a balanced zero-value opening-journal draft", () => {
    const input = validArchiveInput();
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

    const normalized = normalizeArchiveImportInput(input, "user-1");

    expect(normalized.fiscalPeriod.opening?.openingJournals[0]).toMatchObject({
      description: "",
      lines: [{ amount: 0 }, { amount: 0 }],
    });
  });

  it("rejects an unbalanced archived entry", () => {
    const input = validArchiveInput();
    (input.entries[0]!.lines as Array<{ amount: number }>)[1]!.amount = 900;

    const error = captureError(() =>
      normalizeArchiveImportInput(input, "user-1"),
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
      normalizeArchiveImportInput(input, "user-1"),
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
      accountId: "cash",
      amount: 500,
    });

    const error = captureError(() =>
      normalizeArchiveImportInput(input, "user-1"),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "duplicate accountId",
    );
  });

  it("allows empty fixed asset disposal date as unset", () => {
    const input = validArchiveInput();
    input.fixedAssets[0]!.status = "active";
    input.fixedAssets[0]!.disposalDate = "";

    const normalized = normalizeArchiveImportInput(input, "user-1");

    expect(normalized.fixedAssets[0]?.patchInput).toEqual({});
  });
});

type ArchiveOpeningView = {
  openingBalanceLines: Array<{ id: string; accountId: string; amount: number }>;
  openingJournals: Array<{ lines: Array<{ amount: number }> }>;
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
      fiscalPeriodId: "period-1",
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
            accountId: "cash",
            amount: 1000,
          },
        ],
        openingJournals: [
          {
            id: "carry-1",
            date: "2027-01-01",
            description: "再振替",
            businessRate: 1,
            lines: [
              {
                side: "debit",
                bookAccountId: "cash",
                amount: 1000,
              },
              {
                side: "credit",
                bookAccountId: "sales",
                amount: 1000,
              },
            ],
          },
        ],
      },
    },
    entries: [
      {
        id: "entry-1",
        date: "2026-04-01",
        description: "売上",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "cash",
            amount: 1000,
          },
          {
            side: "credit",
            bookAccountId: "sales",
            amount: 1000,
          },
        ],
      },
    ],
    fixedAssets: [
      {
        name: "PC",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 240000,
        usefulLife: 4,
        businessRate: 0.5,
        bookAccountId: "tools",
        status: "sold",
        disposalDate: "2026-12-01",
        disposalPrice: 120000,
      },
    ],
    closings: [{ year: 2026, kind: "closing" }],
  };
}
