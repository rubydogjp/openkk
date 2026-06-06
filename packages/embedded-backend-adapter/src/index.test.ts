import { describe, expect, it } from "vitest";

import type { EntryUpsertInput } from "@rubydogjp/openkk-client-ports";
import type { OpenkkServerPort } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "./index";

describe("createOpenkkEmbeddedBackendAdapter", () => {
  it("passes calls through an in-process HTTP-style request boundary", async () => {
    let capturedInput: EntryUpsertInput | null = null;
    const server = embeddedServer({
      entries: {
        async create(_fiscalPeriodId, input) {
          capturedInput = input;
          return {
            id: "entry-1",
            fiscalPeriodId: "fp-1",
            date: input.date,
            description: input.description,
            localId: input.localId ?? "",
            businessRate: input.businessRate,
            lines: input.lines,
          };
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    const entry = await api.entries.create("fp-1", {
      date: "2026-04-01",
      description: "sale",
      localId: undefined,
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
    });

    expect(entry.id).toBe("entry-1");
    expect(capturedInput).not.toBeNull();
    expect(Object.hasOwn(capturedInput!, "localId")).toBe(false);
  });

  it("unwraps HTTP response bodies for the backend port", async () => {
    const server = embeddedServer({
      fiscalPeriod: {
        async getAll() {
          return [
            {
              id: "fp-1",
              name: "2026",
              startDate: "2026-01-01",
              endDate: "2026-12-31",
              stage: "pre_opening",
              archived: false,
              settingsCompleted: false,
              openingBalancesCompleted: false,
              documentsReceivedCompleted: false,
              opening: null,
            },
          ];
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriod.getAll()).resolves.toHaveLength(1);
  });

  it("throws API error DTOs instead of server Error instances", async () => {
    const server = embeddedServer({
      fiscalPeriod: {
        async patch() {
          throw {
            messageForDeveloper: "archived period",
            messageForUser: "圧縮保存済みの会計期間は変更できません",
            originalMessage: null,
            statusCode: 409,
          };
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriod.patch("fp-1", { name: "x" })).rejects.toEqual({
      messageForDeveloper: "archived period",
      messageForUser: "圧縮保存済みの会計期間は変更できません",
      originalMessage: null,
      statusCode: 409,
    });
  });

  it("maps unknown server failures to HTTP 500 without exposing details", async () => {
    const server = embeddedServer({
      fiscalPeriod: {
        async getAll() {
          throw new Error("database password leaked here");
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriod.getAll()).rejects.toEqual({
      messageForDeveloper:
        "fiscalPeriodsGetAll returned HTTP 500 without OpenkkApiErrorDto",
      messageForUser: "サーバー処理でエラーが発生しました",
      originalMessage: null,
      statusCode: 500,
    });
  });

  it("preserves deliberate HTTP 500 AppError responses", async () => {
    const server = embeddedServer({
      fiscalPeriod: {
        async getAll() {
          throw {
            messageForDeveloper: "storage temporarily unavailable",
            messageForUser: "会計期間を読み込めませんでした",
            originalMessage: null,
            statusCode: 500,
          };
        },
      },
    });
    const api = createOpenkkEmbeddedBackendAdapter(server);

    await expect(api.fiscalPeriod.getAll()).rejects.toEqual({
      messageForDeveloper: "storage temporarily unavailable",
      messageForUser: "会計期間を読み込めませんでした",
      originalMessage: null,
      statusCode: 500,
    });
  });
});

function embeddedServer(
  overrides: Partial<{
    auth: Partial<OpenkkServerPort["auth"]>;
    closing: Partial<OpenkkServerPort["closing"]>;
    entries: Partial<OpenkkServerPort["entries"]>;
    fiscalPeriod: Partial<OpenkkServerPort["fiscalPeriod"]>;
    fixedAssets: Partial<OpenkkServerPort["fixedAssets"]>;
    masterData: Partial<OpenkkServerPort["masterData"]>;
  }>,
): OpenkkServerPort {
  return {
    auth: {
      startSession: async () => ({ authUrl: "embedded://auth" }),
      completeSession: async () => ({ completionCode: "code" }),
      redeemCompletionCode: async () => ({ userId: "user-1" }),
      signOut: async () => undefined,
      ...overrides.auth,
    },
    closing: {
      get: async () => null,
      run: async () => undefined,
      cancel: async () => undefined,
      ...overrides.closing,
    },
    entries: {
      getAll: async () => [],
      create: async () => unused(),
      patch: async () => unused(),
      remove: async () => undefined,
      importMany: async () => ({ importedCount: 0, entries: [] }),
      ...overrides.entries,
    },
    fiscalPeriod: {
      getAll: async () => [],
      create: async () => unused(),
      importArchived: async () => unused(),
      patch: async () => unused(),
      remove: async () => undefined,
      ...overrides.fiscalPeriod,
    },
    fixedAssets: {
      getAll: async () => [],
      create: async () => unused(),
      patch: async () => unused(),
      delete: async () => undefined,
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
