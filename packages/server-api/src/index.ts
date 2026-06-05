import type { OpenkkServerPort } from "@rubydogjp/openkk-server-ports";
import type { ServerUsecases } from "@rubydogjp/openkk-server-usecases";
import type {
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
} from "@rubydogjp/openkk-server-ports";

export type OpenkkServerConfig = {
  userId: string;
};

export type { OpenkkServerPort };

export function createOpenkkServerApi(
  usecases: ServerUsecases,
  config: OpenkkServerConfig,
): OpenkkServerPort {
  const uid = config.userId;
  const getOwnedFiscalPeriod = async (fiscalPeriodId: string) => {
    const period = (await usecases.fiscalPeriod.getAll(uid)).find(
      (candidate) => candidate.id === fiscalPeriodId,
    );
    if (period == null) throw new Error(`Fiscal period ${fiscalPeriodId} not found`);
    return period;
  };
  return {
    auth: {
      startSession: (redirectUrl) =>
        usecases.auth.startSession(redirectUrl),
      completeSession: ({ state, code }) =>
        usecases.auth.completeSession(state, code),
      redeemCompletionCode: async (code) => {
        await usecases.auth.redeemCompletionCode(code);
        return { userId: uid };
      },
      signOut: () => usecases.auth.signOut(),
    },
    closing: {
      get: async (fpId, year) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.closing.get(uid, fpId, year);
      },
      run: async ({ fiscalPeriodId, year, isProvisional }) => {
        await getOwnedFiscalPeriod(fiscalPeriodId);
        return usecases.closing.run(uid, fiscalPeriodId, year, isProvisional);
      },
      cancel: async (fpId, year) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.closing.cancel(uid, fpId, year);
      },
    },
    entries: {
      getAll: async (fpId) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.entries.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        await getOwnedFiscalPeriod(fpId);
        assertEntryInput(input);
        return usecases.entries.create(uid, fpId, input);
      },
      patch: async (fpId, id, input) => {
        await getOwnedFiscalPeriod(fpId);
        assertEntryInput(input);
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Entry ${id} not found in fiscal period ${fpId}`);
        }
        return usecases.entries.update(uid, id, input);
      },
      remove: async (fpId, id) => {
        await getOwnedFiscalPeriod(fpId);
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Entry ${id} not found in fiscal period ${fpId}`);
        }
        await usecases.entries.delete(uid, id);
      },
      importMany: async (fpId, inputs) => {
        await getOwnedFiscalPeriod(fpId);
        inputs.forEach(assertEntryInput);
        const entries = await usecases.entries.importMany(uid, fpId, inputs);
        return { importedCount: entries.length, entries };
      },
    },
    fiscalPeriod: {
      getAll: () => usecases.fiscalPeriod.getAll(uid),
      create: async (input) => {
        assertFiscalPeriodCreateInput(input);
        return usecases.fiscalPeriod.create(uid, input);
      },
      patch: async (id, patch) => {
        const current = await getOwnedFiscalPeriod(id);
        assertFiscalPeriodPatchInput(current, patch);
        return usecases.fiscalPeriod.update(uid, id, patch);
      },
    },
    fixedAssets: {
      getAll: async (fpId) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.fixedAssets.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        await getOwnedFiscalPeriod(fpId);
        assertFixedAssetCreateInput(input);
        return usecases.fixedAssets.create(uid, fpId, input);
      },
      patch: async (fpId, id, patch) => {
        await getOwnedFiscalPeriod(fpId);
        assertFixedAssetPatchInput(patch);
        const existing = await usecases.fixedAssets.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Fixed asset ${id} not found in fiscal period ${fpId}`);
        }
        return usecases.fixedAssets.update(uid, id, patch);
      },
      delete: async (fpId, id) => {
        await getOwnedFiscalPeriod(fpId);
        const existing = await usecases.fixedAssets.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Fixed asset ${id} not found in fiscal period ${fpId}`);
        }
        await usecases.fixedAssets.delete(uid, id);
      },
    },
    masterData: {
      getBookAccounts: () => usecases.masterData.getBookAccounts(),
      getTaxCategories: () => usecases.masterData.getTaxCategories(),
      getBusinessCategories: () =>
        usecases.masterData.getBusinessCategories(),
    },
  };
}

function assertFiscalPeriodCreateInput(input: FiscalPeriodCreateInput) {
  assertDateRange(input.startDate, input.endDate, "Fiscal period");
}

function assertFiscalPeriodPatchInput(
  current: FiscalPeriodApiRecord,
  patch: FiscalPeriodPatchInput,
) {
  const startDate = patch.startDate ?? current.startDate;
  const endDate = patch.endDate ?? current.endDate;
  assertDateRange(startDate, endDate, "Fiscal period");
}

function assertEntryInput(input: EntryUpsertInput) {
  assertIsoDate(input.date, "Entry date");
  assertUnitRate(input.businessRate, "Entry business rate");
  for (const line of input.lines) {
    assertNonNegativeFiniteNumber(line.amount, "Entry line amount");
  }
}

function assertFixedAssetCreateInput(input: FixedAssetCreateInput) {
  assertIsoDate(input.acquisitionDate, "Fixed asset acquisition date");
  assertNonNegativeFiniteNumber(input.acquisitionCost, "Fixed asset acquisition cost");
  assertPositiveInteger(input.usefulLife, "Fixed asset useful life");
  assertUnitRate(input.businessRate, "Fixed asset business rate");
}

function assertFixedAssetPatchInput(input: FixedAssetPatchInput) {
  if (input.acquisitionDate != null) {
    assertIsoDate(input.acquisitionDate, "Fixed asset acquisition date");
  }
  if (input.disposalDate != null && input.disposalDate !== "") {
    assertIsoDate(input.disposalDate, "Fixed asset disposal date");
  }
  if (input.acquisitionCost != null) {
    assertNonNegativeFiniteNumber(input.acquisitionCost, "Fixed asset acquisition cost");
  }
  if (input.usefulLife != null) {
    assertPositiveInteger(input.usefulLife, "Fixed asset useful life");
  }
  if (input.businessRate != null) {
    assertUnitRate(input.businessRate, "Fixed asset business rate");
  }
  if (input.disposalPrice != null) {
    assertNonNegativeFiniteNumber(input.disposalPrice, "Fixed asset disposal price");
  }
}

function assertDateRange(startDate: string, endDate: string, label: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start == null || end == null) {
    throw new Error(`${label} dates are invalid`);
  }
  if (start.getTime() > end.getTime()) {
    throw new Error(`${label} start date must be on or before end date`);
  }
}

function assertIsoDate(value: string, label: string) {
  if (parseIsoDate(value) == null) throw new Error(`${label} is invalid`);
}

function assertNonNegativeFiniteNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function assertUnitRate(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}
