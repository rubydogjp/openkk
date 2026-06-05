import { describe, expect, it } from "vitest";

import { AppError } from "@rubydogjp/openkk-server-domain";
import type { FiscalPeriodArchiveImportInput } from "@rubydogjp/openkk-server-ports";
import { normalizeArchiveImportInput } from "./archive-import";

describe("normalizeArchiveImportInput", () => {
  it("normalizes archived fiscal period payload for db import", () => {
    const input = validArchiveInput();
    const normalized = normalizeArchiveImportInput(input, "user-1");

    expect(normalized.fiscalPeriod).toMatchObject({
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      stage: "post_closing",
      archived: true,
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
            taxCategoryName: "",
            businessCategoryName: "",
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
    expect(normalized.closings).toEqual([
      { year: 2026, isProvisional: false },
    ]);
  });

  it("rejects fiscal period id mismatch", () => {
    const input = validArchiveInput();
    input.fiscalPeriod.id = "another-period";

    const error = captureError(() => normalizeArchiveImportInput(input, "user-1"));

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

    const error = captureError(() => normalizeArchiveImportInput(input, "user-1"));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive fiscalPeriod start date must be on or before end date",
    );
  });

  it("rejects invalid archived entry dates", () => {
    const input = validArchiveInput();
    input.entries[0]!.date = "2026-02-29";

    const error = captureError(() => normalizeArchiveImportInput(input, "user-1"));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entry.date is invalid",
    );
  });

  it("rejects malformed top-level archive collections", () => {
    const input = validArchiveInput();
    (input as unknown as { entries: unknown }).entries = undefined;

    const error = captureError(() => normalizeArchiveImportInput(input, "user-1"));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entries must be an array",
    );
  });

  it("rejects non-object items in archive collections", () => {
    const input = validArchiveInput();
    (input.entries as unknown[])[0] = null;

    const error = captureError(() => normalizeArchiveImportInput(input, "user-1"));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive entry must be an object",
    );
  });

  it("rejects invalid fixed asset values", () => {
    const input = validArchiveInput();
    input.fixedAssets[0]!.usefulLife = 0;

    const error = captureError(() => normalizeArchiveImportInput(input, "user-1"));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "archive fixedAsset.usefulLife must be a positive integer",
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
      stage: "post_closing",
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
        carryoverJournals: [
          {
            id: "carry-1",
            date: "2027-01-01",
            description: "再振替",
            businessRate: 1,
            lines: [
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
    closings: [{ year: 2026, isProvisional: false }],
  };
}
