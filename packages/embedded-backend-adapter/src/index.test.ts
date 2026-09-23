import { describe, expect, it } from "vitest";

import type { EntryUpsertInput } from "@rubydogjp/openkk-client-ports";
import type { OpenkkServerPort } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "./index.js";

describe("createOpenkkEmbeddedBackendAdapter", () => {
  it("passes calls through an in-process HTTP-style request boundary", async () => {
    let capturedInput: EntryUpsertInput | null = null;
    const server = embeddedServer({
      entries: {
        async create(_fiscalPeriodId, input) {
          capturedInput = input;
          return {
            id: "entry-1",
            userId: "user-1",
            fiscalPeriodId: "fp-1",
            date: input.date,
            description: input.description,
            localId: input.localId,
            businessRate: input.businessRate,
            lines: input.lines.map((line, index) => ({
              ...line,
              id: `line-${index + 1}`,
            })),
            createdAt: "1970-01-01T00:00:00.000Z",
            updatedAt: "1970-01-01T00:00:00.000Z",
          };
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    const entry = await api.entries.create("fp-1", {
      date: "2026-04-01",
      description: "sale",
      localId: null,
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
    });

    expect(entry.id).toBe("entry-1");
    expect(capturedInput).not.toBeNull();
    expect(capturedInput).toMatchObject({ localId: null });
  });

  it("unwraps HTTP response bodies for the backend port", async () => {
    const server = embeddedServer({
      fiscalPeriods: {
        async getAll() {
          return [
            {
              id: "fp-1",
              userId: "user-1",
              name: "2026",
              startDate: "2026-01-01",
              endDate: "2026-12-31",
              phase: "pre_opening",
              archiveStatus: "active",
              openingBalancesCompleted: false,
              documentsReceivedCompleted: false,
              opening: {
                openingBalanceLines: [],
                openingJournals: [],
              },
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
              archivedAt: null,
            },
          ];
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriods.getAll()).resolves.toHaveLength(1);
  });

  it("throws API error DTOs instead of server Error instances", async () => {
    const server = embeddedServer({
      fiscalPeriods: {
        async patch() {
          throw {
            messageForDeveloper: "archived period",
            messageForUser: "圧縮保存済みの会計期間は変更できません",
            originalMessage: null,
            statusCode: 409,
            code: null,
          };
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriods.patch("fp-1", { name: "x" })).rejects.toEqual(
      {
        messageForDeveloper: "archived period",
        messageForUser: "圧縮保存済みの会計期間は変更できません",
        originalMessage: null,
        statusCode: 409,
        code: null,
      },
    );
  });

  it("maps unknown server failures to HTTP 500 without exposing details", async () => {
    const server = embeddedServer({
      fiscalPeriods: {
        async getAll() {
          throw new Error("database password leaked here");
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriods.getAll()).rejects.toEqual({
      messageForDeveloper:
        "fiscalPeriodsGetAll returned HTTP 500 without OpenkkApiErrorDto",
      messageForUser: "サーバー処理でエラーが発生しました",
      originalMessage: null,
      statusCode: 500,
      code: null,
    });
  });

  it("preserves deliberate HTTP 500 AppError responses", async () => {
    const server = embeddedServer({
      fiscalPeriods: {
        async getAll() {
          throw {
            messageForDeveloper: "storage temporarily unavailable",
            messageForUser: "会計期間を読み込めませんでした",
            originalMessage: null,
            statusCode: 500,
            code: "storage_unavailable",
          };
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriods.getAll()).rejects.toEqual({
      messageForDeveloper: "storage temporarily unavailable",
      messageForUser: "会計期間を読み込めませんでした",
      originalMessage: null,
      statusCode: 500,
      code: "storage_unavailable",
    });
  });
});

function embeddedServer(
  overrides: Partial<{
    auth: Partial<OpenkkServerPort["auth"]>;
    preClosings: Partial<OpenkkServerPort["preClosings"]>;
    closings: Partial<OpenkkServerPort["closings"]>;
    entries: Partial<OpenkkServerPort["entries"]>;
    fiscalPeriods: Partial<OpenkkServerPort["fiscalPeriods"]>;
    fixedAssets: Partial<OpenkkServerPort["fixedAssets"]>;
    masterData: Partial<OpenkkServerPort["masterData"]>;
  }>,
): OpenkkServerPort {
  return {
    auth: {
      startSession: async () => ({ authUrl: "embedded://auth" }),
      completeSession: async () => ({ completionCode: "code" }),
      redeemCompletionCode: async () => ({
        userId: "user-1",
        displayName: null,
        email: null,
        iconUrl: null,
        authProvider: null,
      }),
      signOut: async () => undefined,
      ...overrides.auth,
    },
    preClosings: {
      get: async () => false,
      run: async () => unused(),
      cancel: async () => unused(),
      ...overrides.preClosings,
    },
    closings: {
      get: async () => false,
      run: async () => unused(),
      ...overrides.closings,
    },
    entries: {
      getAll: async () => [],
      create: async () => unused(),
      update: async () => unused(),
      remove: async () => undefined,
      importMany: async () => ({ importedCount: 0, entries: [] }),
      ...overrides.entries,
    },
    fiscalPeriods: {
      getAll: async () => [],
      create: async () => unused(),
      createNext: async () => unused(),
      importArchived: async () => unused(),
      patch: async () => unused(),
      start: async () => unused(),
      archive: async () => unused(),
      purgeArchivedData: async () => unused(),
      remove: async () => undefined,
      ...overrides.fiscalPeriods,
    },
    fixedAssets: {
      getAll: async () => [],
      create: async () => unused(),
      patch: async () => unused(),
      remove: async () => undefined,
      ...overrides.fixedAssets,
    },
    masterData: {
      getBookAccounts: async () => [],
      getTaxCategories: async () => [],
      getBusinessCategories: async () => [],
      ...overrides.masterData,
    },
  };
}

function unused(): never {
  throw new Error("unexpected embedded server method call");
}
