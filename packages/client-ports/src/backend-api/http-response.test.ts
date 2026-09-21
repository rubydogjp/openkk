import { describe, expect, it } from "vitest";

import {
  isMaintenanceModeError,
  openkkHttpTransportError,
  resolveOpenkkHttpResponse,
} from "./http-response.js";
import { MAINTENANCE_MODE_ERROR_CODE } from "./types.js";

describe("resolveOpenkkHttpResponse", () => {
  it("returns the response body only for the endpoint success status", () => {
    expect(
      resolveOpenkkHttpResponse("fiscalPeriodCreate", {
        status: 201,
        body: { fiscalPeriod: fiscalPeriod() },
      }),
    ).toEqual({ fiscalPeriod: fiscalPeriod() });
  });

  it("rejects a different successful HTTP status as a protocol error", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("fiscalPeriodCreate", {
        status: 200,
        body: { fiscalPeriod: { id: "fp-1" } },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "fiscalPeriodCreate expected HTTP 201 but received 200",
      messageForUser: "バックエンドから不正な応答を受信しました",
      statusCode: 200,
    });
  });

  it("preserves an AppError response body and trusts the HTTP status", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("fiscalPeriodPatch", {
        status: 409,
        body: {
          messageForDeveloper: "archived period",
          messageForUser: "圧縮保存済みです",
          originalMessage: null,
          statusCode: 400,
          code: null,
        },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper: "archived period",
      messageForUser: "圧縮保存済みです",
      originalMessage: null,
      statusCode: 409,
    });
  });

  it("preserves a structured AppError body for HTTP 500", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 500,
        body: {
          messageForDeveloper: "database unavailable",
          messageForUser: "データを読み込めませんでした",
          originalMessage: null,
          statusCode: 500,
          code: null,
        },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper: "database unavailable",
      messageForUser: "データを読み込めませんでした",
      statusCode: 500,
    });
  });

  it("creates a safe AppError when HTTP 500 has no error body", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 500,
        body: undefined,
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "entriesGetAll returned HTTP 500 without OpenkkApiErrorDto",
      messageForUser: "サーバー処理でエラーが発生しました",
      originalMessage: null,
      statusCode: 500,
    });
  });

  it("does not trust a malformed error response body", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 503,
        body: { message: "temporarily unavailable" },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "entriesGetAll returned HTTP 503 without OpenkkApiErrorDto",
      messageForUser: "サーバー処理でエラーが発生しました",
      originalMessage: '{"message":"temporarily unavailable"}',
      statusCode: 503,
    });
  });

  it("rejects a success response whose envelope has the wrong shape", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 200,
        body: { entries: "not-an-array" },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "entriesGetAll returned a malformed success response",
      messageForUser: "バックエンドから不正な応答を受信しました",
      statusCode: 200,
    });
  });

  it("rejects a malformed record nested in a successful response", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
        status: 200,
        body: {
          fiscalPeriods: [{ ...fiscalPeriod(), settingsCompleted: "yes" }],
        },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "fiscalPeriodsGetAll returned a malformed success response",
    });
  });

  it("rejects duplicate response records and duplicate entry line ids", () => {
    const duplicateEntry = entryResponse();
    const duplicateLineEntry = {
      ...entryResponse(),
      lines: entryResponse().lines.map((line) => ({
        ...line,
        id: "same-line-id",
      })),
    };

    for (const entries of [
      [duplicateEntry, duplicateEntry],
      [duplicateLineEntry],
    ]) {
      expect(
        captureError(() =>
          resolveOpenkkHttpResponse("entriesGetAll", {
            status: 200,
            body: { entries },
          }),
        ),
      ).toMatchObject({
        messageForDeveloper:
          "entriesGetAll returned a malformed success response",
      });
    }
  });

  it("rejects blank identifiers and invalid timestamps", () => {
    const invalidPeriods = [
      { ...fiscalPeriod(), id: " " },
      { ...fiscalPeriod(), updatedAt: "not-a-timestamp" },
      { ...fiscalPeriod(), archiveDataAvailable: "yes" },
      { ...fiscalPeriod(), archivedAt: "not-a-timestamp" },
    ];

    for (const period of invalidPeriods) {
      expect(
        captureError(() =>
          resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
            status: 200,
            body: { fiscalPeriods: [period] },
          }),
        ),
      ).toMatchObject({
        messageForDeveloper:
          "fiscalPeriodsGetAll returned a malformed success response",
      });
    }
  });

  it("rejects a closing presence flag that is not a boolean", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("closingGet", {
          status: 200,
          body: { closed: "yes" },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper: "closingGet returned a malformed success response",
    });
    expect(
      resolveOpenkkHttpResponse("closingGet", {
        status: 200,
        body: { closed: false },
      }),
    ).toEqual({ closed: false });
    expect(
      resolveOpenkkHttpResponse("preClosingGet", {
        status: 200,
        body: { preClosed: true },
      }),
    ).toEqual({ preClosed: true });
  });

  it("rejects malformed and duplicate master records", () => {
    const account = bookAccountResponse();
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("masterBookAccounts", {
          status: 200,
          body: { bookAccounts: [account, account] },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "masterBookAccounts returned a malformed success response",
    });
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("masterTaxCategories", {
          status: 200,
          body: {
            taxCategories: [
              {
                id: "tax-invalid",
                name: "invalid",
                rate: 1.1,
                createdAt: "1970-01-01T00:00:00.000Z",
                updatedAt: "1970-01-01T00:00:00.000Z",
              },
            ],
          },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "masterTaxCategories returned a malformed success response",
    });
  });

  it("accepts tax-category rates expressed in basis points", () => {
    const category = {
      id: "tax_10",
      name: "課税 10%",
      rate: 1000,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    };

    expect(
      resolveOpenkkHttpResponse("masterTaxCategories", {
        status: 200,
        body: { taxCategories: [category] },
      }),
    ).toEqual({ taxCategories: [category] });
  });

  it("accepts carried opening balances before next-period settings start", () => {
    const period = {
      ...fiscalPeriod(),
      openingBalancesCompleted: true,
      opening: openingResponse({
        openingBalanceLines: [
          { id: "asset", accountId: "a:現金", amount: 1000 },
          { id: "equity", accountId: "l:元入金", amount: 1000 },
        ],
      }),
    };

    expect(
      resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
        status: 200,
        body: { fiscalPeriods: [period] },
      }),
    ).toEqual({ fiscalPeriods: [period] });
  });

  it("accepts a zero-value opening-journal draft", () => {
    const period = {
      ...fiscalPeriod(),
      opening: openingResponse({
        openingJournals: [
          {
            id: "journal-1",
            date: "2026-01-01",
            description: "",
            businessRate: 1,
            lines: entryResponse().lines.map((line) => ({
              ...line,
              amount: 0,
            })),
          },
        ],
      }),
    };

    expect(
      resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
        status: 200,
        body: { fiscalPeriods: [period] },
      }),
    ).toEqual({ fiscalPeriods: [period] });
  });

  it("rejects unsafe authentication redirect URLs", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("authStartSession", {
          status: 200,
          body: { authUrl: "javascript:alert(1)" },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "authStartSession returned a malformed success response",
    });
    expect(
      resolveOpenkkHttpResponse("authStartSession", {
        status: 200,
        body: { authUrl: "https://auth.example.test/authorize" },
      }),
    ).toEqual({ authUrl: "https://auth.example.test/authorize" });
  });

  it("rejects an unsafe user icon URL in an authentication response", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("authRedeemCompletionCode", {
          status: 200,
          body: {
            userId: "user-1",
            displayName: null,
            email: null,
            iconUrl: "javascript:alert(1)",
            authProvider: null,
          },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "authRedeemCompletionCode returned a malformed success response",
    });
    expect(
      resolveOpenkkHttpResponse("authRedeemCompletionCode", {
        status: 200,
        body: {
          userId: "user-1",
          displayName: null,
          email: null,
          iconUrl: "https://images.example.test/user.png",
          authProvider: null,
        },
      }),
    ).toMatchObject({ userId: "user-1" });
  });

  it("rejects semantically invalid successful records", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
          status: 200,
          body: {
            fiscalPeriods: [
              { ...fiscalPeriod(), startDate: "2026-02-29" },
            ],
          },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "fiscalPeriodsGetAll returned a malformed success response",
    });
  });

  it("rejects an opening balance response with an empty account label", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
          status: 200,
          body: {
            fiscalPeriods: [
              {
                ...fiscalPeriod(),
                opening: {
                  id: "opening-1",
                  userId: "user-1",
                  fiscalPeriodId: "fp-1",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                  openingBalanceLines: [
                    { id: "line-1", accountId: "a:", amount: 1000 },
                  ],
                  openingJournals: [],
                },
              },
            ],
          },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "fiscalPeriodsGetAll returned a malformed success response",
    });
  });

  it("rejects opening data owned by a different fiscal period", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
          status: 200,
          body: {
            fiscalPeriods: [
              {
                ...fiscalPeriod(),
                opening: openingResponse({ fiscalPeriodId: "fp-other" }),
              },
            ],
          },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "fiscalPeriodsGetAll returned a malformed success response",
    });
  });

  it("rejects duplicate opening accounts", () => {
    const opening = openingResponse({
      openingBalanceLines: [
        { id: "asset-1", accountId: "a:現金", amount: 1000 },
        { id: "asset-2", accountId: "a:現金", amount: 1000 },
      ],
    });

    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
          status: 200,
          body: { fiscalPeriods: [{ ...fiscalPeriod(), opening }] },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "fiscalPeriodsGetAll returned a malformed success response",
    });
  });

  it("rejects an import count that disagrees with returned entries", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("entryImportMany", {
          status: 200,
          body: { importedCount: 1, entries: [] },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "entryImportMany returned a malformed success response",
    });
  });

  it("rejects an otherwise valid entry whose response has too many lines", () => {
    const baseLines = entryResponse().lines;
    const lines = Array.from({ length: 1_001 }, (_, index) => {
      const debit = index < 500;
      return {
        ...baseLines[debit ? 0 : 1],
        id: `line-${index}`,
        side: debit ? "debit" : "credit",
        amount: debit && index === 0 ? 2 : 1,
      };
    });

    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("entryCreate", {
          status: 201,
          body: { entry: { ...entryResponse(), lines } },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper: "entryCreate returned a malformed success response",
    });
  });

  it("rejects a whitespace-only entry local identifier", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("entryCreate", {
          status: 201,
          body: { entry: { ...entryResponse(), localId: "   " } },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper: "entryCreate returned a malformed success response",
    });
  });

  it("rejects oversized opening collections and aggregate journal lines", () => {
    const tooManyBalances = openingResponse({
      openingBalanceLines: Array(10_001).fill({
        id: "balance",
        accountId: "a:現金",
        amount: 0,
      }),
    });
    const line = entryResponse().lines[0];
    const lines = Array(1_000).fill(line);
    const tooManyJournalLines = openingResponse({
      openingJournals: Array.from({ length: 101 }, (_, index) => ({
        id: `journal-${index}`,
        date: "2026-01-01",
        description: "",
        businessRate: 1,
        lines,
      })),
    });

    for (const opening of [tooManyBalances, tooManyJournalLines]) {
      const error = captureError(() =>
        resolveOpenkkHttpResponse("fiscalPeriodsGetAll", {
          status: 200,
          body: { fiscalPeriods: [{ ...fiscalPeriod(), opening }] },
        }),
      ) as { messageForDeveloper: string; originalMessage: string };
      expect(error.messageForDeveloper).toContain("malformed success response");
      expect(error.originalMessage.length).toBeLessThanOrEqual(2_001);
    }
  });

  it("rejects fixed-asset values outside their allowed range", () => {
    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("fixedAssetCreate", {
          status: 201,
          body: {
            fixedAsset: { ...fixedAssetResponse(), acquisitionCost: 0 },
          },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "fixedAssetCreate returned a malformed success response",
    });

    expect(
      captureError(() =>
        resolveOpenkkHttpResponse("fixedAssetCreate", {
          status: 201,
          body: {
            fixedAsset: { ...fixedAssetResponse(), usefulLife: 101 },
          },
        }),
      ),
    ).toMatchObject({
      messageForDeveloper:
        "fixedAssetCreate returned a malformed success response",
    });
  });

  it("represents a no-content response as explicit null", () => {
    expect(
      resolveOpenkkHttpResponse("authSignOut", {
        status: 204,
        body: null,
      }),
    ).toBeNull();
    expect(() =>
      resolveOpenkkHttpResponse("authSignOut", {
        status: 204,
        body: { ok: true },
      }),
    ).toThrow();
    expect(() =>
      resolveOpenkkHttpResponse("authSignOut", {
        status: 204,
        body: undefined,
      }),
    ).toThrow();
  });

  it("bounds malformed response details copied into an error", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 200,
        body: { entries: "x".repeat(10_000) },
      }),
    ) as { originalMessage: string };

    expect(error.originalMessage.length).toBeLessThanOrEqual(2_001);
    expect(error.originalMessage).toContain("…");
  });
});

describe("isMaintenanceModeError", () => {
  it("detects the maintenance error code preserved on a thrown envelope", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 503,
        body: {
          messageForDeveloper: "service in maintenance",
          messageForUser: "メンテナンス中です",
          originalMessage: null,
          statusCode: 503,
          code: MAINTENANCE_MODE_ERROR_CODE,
        },
      }),
    );
    expect(isMaintenanceModeError(error)).toBe(true);
  });

  it("ignores unrelated server errors", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 500,
        body: {
          messageForDeveloper: "database unavailable",
          messageForUser: "データを読み込めませんでした",
          originalMessage: null,
          statusCode: 500,
          code: null,
        },
      }),
    );
    expect(isMaintenanceModeError(error)).toBe(false);
  });

  it("falls back to a 503 whose developer message names the code", () => {
    expect(
      isMaintenanceModeError({
        statusCode: 503,
        messageForDeveloper: `aborted by ${MAINTENANCE_MODE_ERROR_CODE}`,
      }),
    ).toBe(true);
  });
});

describe("openkkHttpTransportError", () => {
  it("distinguishes failures that have no HTTP response", () => {
    expect(openkkHttpTransportError(new Error("network offline"))).toEqual({
      messageForDeveloper:
        "OpenKK HTTP transport failed before receiving a response",
      code: null,
      messageForUser: "サーバーに接続できませんでした",
      originalMessage: "network offline",
      statusCode: null,
    });
  });

  it("does not trust a structurally invalid error DTO", () => {
    const error = openkkHttpTransportError({
      messageForDeveloper: "pretend API error",
      messageForUser: "pretend",
      originalMessage: null,
      statusCode: Number.NaN,
    });

    expect(error.messageForDeveloper).toBe(
      "OpenKK HTTP transport failed before receiving a response",
    );
    expect(error.statusCode).toBeNull();
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

function fiscalPeriod() {
  return {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "pre_opening",
    archiveStatus: "active",
    archiveDataAvailable: true,
    archivedAt: null,
    settingsCompleted: false,
    openingBalancesCompleted: false,
    documentsReceivedCompleted: false,
    opening: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function entryResponse() {
  return {
    id: "entry-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    description: "現金売上",
    localId: "local-1",
    businessRate: 1,
    lines: [
      {
        id: "line-1",
        side: "debit",
        bookAccountId: "acct_cash",
        amount: 1000,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      },
      {
        id: "line-2",
        side: "credit",
        bookAccountId: "acct_sales",
        amount: 1000,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function fixedAssetResponse() {
  return {
    id: "asset-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    name: "業務用PC",
    acquisitionDate: "2026-01-01",
    acquisitionCost: 120_000,
    usefulLife: 4,
    depreciationMethod: "straight_line",
    businessRate: 1,
    status: "active",
    disposalDate: null,
    disposalPrice: null,
    bookAccountId: "acct_equipment",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function bookAccountResponse() {
  return {
    id: "acct_cash",
    name: "現金",
    description: "現金",
    kana: "ｹﾞﾝｷﾝ",
    normalBalanceSide: "debit",
    accountType: "asset",
    balanceSheetSection: "current_asset",
    sortOrder: 111,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function openingResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "opening-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    openingBalanceLines: [],
    openingJournals: [],
    ...overrides,
  };
}
