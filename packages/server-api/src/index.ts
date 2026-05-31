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
      get: (fpId, year) => usecases.closing.get(uid, fpId, year),
      run: ({ fiscalPeriodId, year, isProvisional }) =>
        usecases.closing.run(uid, fiscalPeriodId, year, isProvisional),
      cancel: (fpId, year) => usecases.closing.cancel(uid, fpId, year),
    },
    entries: {
      getAll: (fpId) => usecases.entries.getAll(uid, fpId),
      create: (fpId, input) => usecases.entries.create(uid, fpId, input),
      patch: async (fpId, id, input) => {
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Entry ${id} not found in fiscal period ${fpId}`);
        }
        return usecases.entries.update(uid, id, input);
      },
      remove: (_fpId, id) => usecases.entries.delete(uid, id),
      importMany: async (fpId, inputs) => {
        const entries = await usecases.entries.importMany(uid, fpId, inputs);
        return { importedCount: entries.length, entries };
      },
    },
    fiscalPeriod: {
      getAll: () => usecases.fiscalPeriod.getAll(uid),
      create: (input) => usecases.fiscalPeriod.create(uid, input),
      patch: (id, patch) => usecases.fiscalPeriod.update(uid, id, patch),
    },
    fixedAssets: {
      getAll: (fpId) => usecases.fixedAssets.getAll(uid, fpId),
      create: (fpId, input) =>
        usecases.fixedAssets.create(uid, fpId, input),
      patch: async (fpId, id, patch) => {
        const existing = await usecases.fixedAssets.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw new Error(`Fixed asset ${id} not found in fiscal period ${fpId}`);
        }
        return usecases.fixedAssets.update(uid, id, patch);
      },
      delete: async (fpId, id) => {
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
