import type { OpenkkServerPort } from "@rubydogjp/openkk-server-ports";
import type { ServerUsecases } from "@rubydogjp/openkk-server-usecases";

export type OpenkkServerConfig = {
  userId: string;
};

export type { OpenkkServerPort };

export function createOpenkkServerApi(
  usecases: ServerUsecases,
  config: OpenkkServerConfig,
): OpenkkServerPort {
  const uid = config.userId;
  const assertFiscalPeriodOwned = async (fiscalPeriodId: string) => {
    const exists = (await usecases.fiscalPeriod.getAll(uid)).some(
      (period) => period.id === fiscalPeriodId,
    );
    if (!exists) throw new Error(`Fiscal period ${fiscalPeriodId} not found`);
  };
  return {
    auth: {
      startSession: (redirectUrl) =>
        usecases.auth.startSession(redirectUrl),
      completeSession: ({ state, code }) =>
        usecases.auth.completeSession(state, code),
      redeemCompletionCode: (code) =>
        usecases.auth.redeemCompletionCode(code),
      signOut: () => usecases.auth.signOut(),
    },
    closing: {
      get: async (fpId, year) => {
        await assertFiscalPeriodOwned(fpId);
        return usecases.closing.get(uid, fpId, year);
      },
      run: async ({ fiscalPeriodId, year, isProvisional }) => {
        await assertFiscalPeriodOwned(fiscalPeriodId);
        return usecases.closing.run(uid, fiscalPeriodId, year, isProvisional);
      },
      cancel: async (fpId, year) => {
        await assertFiscalPeriodOwned(fpId);
        return usecases.closing.cancel(uid, fpId, year);
      },
    },
    entries: {
      getAll: async (fpId) => {
        await assertFiscalPeriodOwned(fpId);
        return usecases.entries.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        await assertFiscalPeriodOwned(fpId);
        return usecases.entries.create(uid, fpId, input);
      },
      patch: async (fpId, id, input) => {
        await assertFiscalPeriodOwned(fpId);
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Entry ${id} not found in fiscal period ${fpId}`);
        }
        return usecases.entries.update(uid, id, input);
      },
      remove: async (fpId, id) => {
        await assertFiscalPeriodOwned(fpId);
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Entry ${id} not found in fiscal period ${fpId}`);
        }
        await usecases.entries.delete(uid, id);
      },
      importMany: async (fpId, inputs) => {
        await assertFiscalPeriodOwned(fpId);
        const entries = await usecases.entries.importMany(uid, fpId, inputs);
        return { importedCount: entries.length, entries };
      },
    },
    fiscalPeriod: {
      getAll: () => usecases.fiscalPeriod.getAll(uid),
      create: (input) => usecases.fiscalPeriod.create(uid, input),
      patch: async (id, patch) => {
        await assertFiscalPeriodOwned(id);
        return usecases.fiscalPeriod.update(uid, id, patch);
      },
    },
    fixedAssets: {
      getAll: async (fpId) => {
        await assertFiscalPeriodOwned(fpId);
        return usecases.fixedAssets.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        await assertFiscalPeriodOwned(fpId);
        return usecases.fixedAssets.create(uid, fpId, input);
      },
      patch: async (fpId, id, patch) => {
        await assertFiscalPeriodOwned(fpId);
        const existing = await usecases.fixedAssets.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Fixed asset ${id} not found in fiscal period ${fpId}`);
        }
        return usecases.fixedAssets.update(uid, id, patch);
      },
      delete: async (fpId, id) => {
        await assertFiscalPeriodOwned(fpId);
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
