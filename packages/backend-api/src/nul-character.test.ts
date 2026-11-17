import { describe, expect, it } from "vitest";

import type { OpenkkDbPort } from "@rubydogjp/openkk-engine";

import { createOpenkkBackendApi } from "./index.js";
import type {
  EntryUpsertInput,
  FiscalPeriodArchiveImportInput,
  OpenkkBackendApi,
} from "./contract.js";
import {
  entry,
  fiscalPeriod,
  fixedAsset,
} from "../test-support/api-records.js";

const NUL = "\u0000";
const UNUSABLE_CHARACTER_MESSAGE = "使えない文字が含まれています";

function backendApiThatMustNotWrite(): {
  backendApi: OpenkkBackendApi;
  writes: string[];
} {
  const writes: string[] = [];
  const period = fiscalPeriod({ id: "fp-1", userId: "user-1" });
  const unopened = fiscalPeriod({
    id: "fp-unopened",
    userId: "user-1",
    phase: "pre_opening",
    openingBalancesCompleted: false,
    startDate: "2027-01-01",
    endDate: "2027-12-31",
  });
  const storedEntry = entry({ id: "entry-1", fiscalPeriodId: "fp-1" });
  const storedAsset = fixedAsset({
    id: "asset-1",
    fiscalPeriodId: "fp-1",
    name: "パソコン",
    acquisitionCost: 100000,
    usefulLife: 4,
    bookAccountId: "acct_equipment",
  });
  const written = (name: string) => async () => {
    writes.push(name);
    throw new Error(`unexpected write: ${name}`);
  };
  const db: OpenkkDbPort = {
    fiscalPeriods: {
      getAll: async () => [period, unopened],
      getById: async (id) =>
        [period, unopened].find((candidate) => candidate.id === id) ?? null,
      create: written("fiscalPeriods.create"),
      createNext: written("fiscalPeriods.createNext"),
      applyCarryover: written("fiscalPeriods.applyCarryover"),
      applyCarryoverFromArchive: written(
        "fiscalPeriods.applyCarryoverFromArchive",
      ),
      importArchived: written("fiscalPeriods.importArchived"),
      patch: written("fiscalPeriods.patch"),
      start: written("fiscalPeriods.start"),
      remove: written("fiscalPeriods.remove"),
    },
    entries: {
      getAll: async () => [storedEntry],
      getById: async (id) => (id === storedEntry.id ? storedEntry : null),
      create: written("entries.create"),
      update: written("entries.update"),
      remove: written("entries.remove"),
      importMany: written("entries.importMany"),
    },
    fixedAssets: {
      getAll: async () => [storedAsset],
      getById: async (id) => (id === storedAsset.id ? storedAsset : null),
      create: written("fixedAssets.create"),
      patch: written("fixedAssets.patch"),
      remove: written("fixedAssets.remove"),
    },
    preClosings: {
      run: written("preClosings.run"),
      cancel: written("preClosings.cancel"),
    },
    closings: { run: written("closings.run") },
    masterData: {
      getBookAccounts: async () => [],
      getTaxCategories: async () => [],
      getBusinessCategories: async () => [],
    },
  };
  return {
    backendApi: createOpenkkBackendApi(db, { userId: "user-1" }),
    writes,
  };
}

function entryInput(overrides: Partial<EntryUpsertInput>): EntryUpsertInput {
  const line = (side: "debit" | "credit", bookAccountId: string) => ({
    side,
    bookAccountId,
    amount: 1000,
    partnerName: "",
    taxCategoryId: "tax_out_of_scope",
    businessCategoryId: "biz_none",
  });
  return {
    date: "2026-04-01",
    description: "家賃",
    localId: null,
    businessRate: 1,
    lines: [line("debit", "acct_cash"), line("credit", "acct_sales")],
    ...overrides,
  };
}

function archiveInput(
  fiscalPeriodOverrides: Partial<
    FiscalPeriodArchiveImportInput["fiscalPeriod"]
  >,
): FiscalPeriodArchiveImportInput {
  return {
    manifest: {
      format: "openkk-fiscal-period-archive",
      version: 2,
      createdAt: "2027-01-01T00:00:00.000Z",
    },
    fiscalPeriod: {
      name: "2025年分",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      phase: "post_closing",
      archiveStatus: "archived",
      openingBalancesCompleted: true,
      documentsReceivedCompleted: true,
      opening: { balanceLines: [], journals: [] },
      ...fiscalPeriodOverrides,
    },
    entries: [],
    fixedAssets: [],
    closings: [],
  } as unknown as FiscalPeriodArchiveImportInput;
}

describe("backend-api refuses U+0000 at every entrance", () => {
  const withNul = entryInput({});
  const cases: Array<{
    name: string;
    call: (backendApi: OpenkkBackendApi) => Promise<unknown>;
  }> = [
    {
      name: "entry description on create",
      call: (api) =>
        api.entries.create("fp-1", entryInput({ description: `${NUL}家賃` })),
    },
    {
      name: "entry number on create",
      call: (api) =>
        api.entries.create("fp-1", entryInput({ localId: `A${NUL}B` })),
    },
    {
      name: "entry line partner on update",
      call: (api) =>
        api.entries.update(
          "fp-1",
          "entry-1",
          entryInput({
            lines: withNul.lines.map((line) => ({
              ...line,
              partnerName: `大家${NUL}`,
            })),
          }),
        ),
    },
    {
      name: "entry description in a bulk import",
      call: (api) =>
        api.entries.importMany("fp-1", [
          entryInput({}),
          entryInput({ description: `家賃${NUL}2` }),
        ]),
    },
    {
      name: "fiscal period name on create",
      call: (api) =>
        api.fiscalPeriods.create({
          name: `2030${NUL}年分`,
          startDate: "2030-01-01",
          endDate: "2030-12-31",
        }),
    },
    {
      name: "fiscal period name on patch",
      call: (api) =>
        api.fiscalPeriods.patch("fp-unopened", { name: `2027${NUL}` }),
    },
    {
      name: "opening balance line id on patch",
      call: (api) =>
        api.fiscalPeriods.patch("fp-1", {
          opening: {
            balanceLines: [
              { id: `${NUL}a`, accountId: "a:現金", amount: 1000 },
              { id: "b", accountId: "l:元入金", amount: 1000 },
            ],
            journals: [],
          },
        }),
    },
    {
      name: "next fiscal period name",
      call: (api) =>
        api.fiscalPeriods.createNext({
          sourceFiscalPeriodId: "fp-1",
          name: `2028${NUL}`,
          startDate: "2028-01-01",
          endDate: "2028-12-31",
          carryBalances: true,
          reversalEntryIds: [],
          carryFixedAssets: true,
        }),
    },
    {
      name: "opening balance line id in an imported archive",
      call: (api) =>
        api.fiscalPeriods.importArchived(
          archiveInput({
            opening: {
              balanceLines: [
                { id: `${NUL}a`, accountId: "a:現金", amount: 1000 },
                { id: "b", accountId: "l:元入金", amount: 1000 },
              ],
              journals: [],
            },
          }),
        ),
    },
    {
      name: "fiscal period name in an archive used for carryover",
      call: (api) =>
        api.fiscalPeriods.applyCarryoverFromArchive("fp-unopened", {
          archive: archiveInput({ name: `2025${NUL}` }),
          carryBalances: true,
          reversalEntryIndexes: null,
          carryFixedAssets: false,
        }),
    },
    {
      name: "fixed asset name on create",
      call: (api) =>
        api.fixedAssets.create("fp-1", {
          name: `パソコン${NUL}`,
          acquisitionDate: "2026-04-01",
          acquisitionCost: 180000,
          usefulLife: 4,
          depreciationMethod: "straight_line",
          businessRate: 1,
          bookAccountId: "acct_equipment",
        }),
    },
    {
      name: "fixed asset name on patch",
      call: (api) =>
        api.fixedAssets.patch("fp-1", "asset-1", { name: `${NUL}パソコン` }),
    },
  ];

  it.each(cases)("$name", async ({ call }) => {
    const { backendApi, writes } = backendApiThatMustNotWrite();

    await expect(call(backendApi)).rejects.toMatchObject({
      statusCode: 400,
      messageForUser: UNUSABLE_CHARACTER_MESSAGE,
    });
    expect(writes).toEqual([]);
  });
});
