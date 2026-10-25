import {
  assertEntryCollectionItemLimit,
  assertEntryCollectionLineLimit,
  assertFiscalPeriodPatchMatchesPhase,
  assertNoOverlappingActiveFiscalPeriod,
  assertNonBlankString,
  serverConflictError,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import {
  serializePortOperations,
  type OpenkkServerPort,
} from "@rubydogjp/openkk-server-ports";
import type { ServerUsecases } from "@rubydogjp/openkk-server-usecases";
import { assertClosingGeneratedEntries } from "./closing-validation.js";
import { assertEditableEntryInput } from "./entry-validation.js";
import {
  archivedFiscalPeriodError,
  assertFiscalPeriodCreateInput,
  assertFiscalPeriodNextCreateInput,
  assertFiscalPeriodContainsExistingData,
  assertFiscalPeriodPatchInput,
  assertFiscalPeriodReadyForPreClosing,
  assertPeriodDataAvailable,
  assertPeriodPhase,
  assertPeriodPhaseOneOf,
} from "./fiscal-period-validation.js";
import {
  assertFixedAssetCreateInput,
  assertFixedAssetPatchInput,
  assertPatchedFixedAsset,
} from "./fixed-asset-validation.js";

export type OpenkkServerConfig = {
  userId: string;
};

export type { OpenkkServerPort };

export function createOpenkkServerApi(
  usecases: ServerUsecases,
  config: OpenkkServerConfig,
): OpenkkServerPort {
  const userId = config.userId;
  const requireOwnedFiscalPeriod = async (fiscalPeriodId: string) => {
    assertNonBlankString(fiscalPeriodId, "Fiscal period id");
    const period = await usecases.fiscalPeriods.getById(userId, fiscalPeriodId);
    if (period == null) {
      throw serverNotFoundError(`Fiscal period ${fiscalPeriodId} not found`);
    }
    return period;
  };
  const requireOwnedEntry = async (fiscalPeriodId: string, id: string) => {
    assertNonBlankString(id, "Entry id");
    const entry = await usecases.entries.getById(userId, id);
    if (entry == null || entry.fiscalPeriodId !== fiscalPeriodId) {
      throw serverNotFoundError(
        `Entry ${id} not found in fiscal period ${fiscalPeriodId}`,
      );
    }
    return entry;
  };
  const requireOwnedFixedAsset = async (fiscalPeriodId: string, id: string) => {
    assertNonBlankString(id, "Fixed asset id");
    const asset = await usecases.fixedAssets.getById(userId, id);
    if (asset == null || asset.fiscalPeriodId !== fiscalPeriodId) {
      throw serverNotFoundError(
        `Fixed asset ${id} not found in fiscal period ${fiscalPeriodId}`,
      );
    }
    return asset;
  };
  const api: OpenkkServerPort = {
    auth: {
      startSession: (redirectUrl) => {
        assertNonBlankString(redirectUrl, "Auth redirect URL");
        return usecases.auth.startSession(redirectUrl);
      },
      completeSession: (state, code) => {
        assertNonBlankString(state, "Auth state");
        assertNonBlankString(code, "Auth code");
        return usecases.auth.completeSession(state, code);
      },
      redeemCompletionCode: async (code) => {
        assertNonBlankString(code, "Auth completion code");
        await usecases.auth.redeemCompletionCode(code);
        return {
          userId,
          displayName: null,
          email: null,
          iconUrl: null,
          authProvider: null,
        };
      },
      signOut: () => usecases.auth.signOut(),
    },
    preClosings: {
      run: async (fiscalPeriodId) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "run pre-closing");
        assertFiscalPeriodReadyForPreClosing(period);
        return usecases.preClosings.run(userId, fiscalPeriodId);
      },
      cancel: async (fiscalPeriodId) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "pre_closing", "cancel pre-closing");
        return usecases.preClosings.cancel(userId, fiscalPeriodId);
      },
    },
    closings: {
      run: async (fiscalPeriodId, entries) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "pre_closing", "run closing");
        assertClosingGeneratedEntries(entries, period);
        return usecases.closings.run(userId, fiscalPeriodId, entries);
      },
    },
    entries: {
      getAll: async (fiscalPeriodId) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodDataAvailable(period, "read entries");
        return usecases.entries.getAll(userId, fiscalPeriodId);
      },
      create: async (fiscalPeriodId, input) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "create entry");
        assertEditableEntryInput(input, period, null);
        return usecases.entries.create(userId, fiscalPeriodId, input);
      },
      update: async (fiscalPeriodId, id, input) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "update entry");
        const existing = await requireOwnedEntry(fiscalPeriodId, id);
        assertEditableEntryInput(input, period, existing);
        return usecases.entries.update(userId, id, input);
      },
      remove: async (fiscalPeriodId, id) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "delete entry");
        await requireOwnedEntry(fiscalPeriodId, id);
        await usecases.entries.remove(userId, id);
      },
      importMany: async (fiscalPeriodId, inputs) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhaseOneOf(
          period,
          ["pre_opening", "journalizing"],
          "import entries",
        );
        if (!Array.isArray(inputs)) {
          throw serverValidationError(
            "Entry import input must be an array",
            null,
          );
        }
        assertEntryCollectionItemLimit(
          inputs,
          "Imported entries",
          "一度に取り込める仕訳件数を超えています。ファイルを分割してください",
        );
        assertEntryCollectionLineLimit(
          inputs,
          "Imported entries",
          "一度に取り込める仕訳明細数を超えています。ファイルを分割してください",
        );
        for (const input of inputs) {
          assertEditableEntryInput(input, period, null);
        }
        const entries = await usecases.entries.importMany(
          userId,
          fiscalPeriodId,
          inputs,
        );
        return { importedCount: entries.length, entries };
      },
    },
    fiscalPeriods: {
      getAll: () => usecases.fiscalPeriods.getAll(userId),
      create: async (input) => {
        assertFiscalPeriodCreateInput(input);
        assertNoOverlappingActiveFiscalPeriod(
          input,
          await usecases.fiscalPeriods.getAll(userId),
        );
        return usecases.fiscalPeriods.create(userId, input);
      },
      createNext: async (input) => {
        assertFiscalPeriodNextCreateInput(input);
        assertNoOverlappingActiveFiscalPeriod(
          input,
          await usecases.fiscalPeriods.getAll(userId),
        );
        return usecases.fiscalPeriods.createNext(userId, input);
      },
      importArchived: (input) =>
        usecases.fiscalPeriods.importArchived(userId, input),
      patch: async (id, patch) => {
        const current = await requireOwnedFiscalPeriod(id);
        if (current.archiveStatus !== "active") {
          throw archivedFiscalPeriodError(
            `Archived fiscal period ${id} cannot be updated`,
          );
        }
        assertFiscalPeriodPatchMatchesPhase(current, patch);
        assertFiscalPeriodPatchInput(current, patch);
        if (patch.startDate !== undefined || patch.endDate !== undefined) {
          const effectivePeriod = {
            startDate: patch.startDate ?? current.startDate,
            endDate: patch.endDate ?? current.endDate,
          };
          const [periods, entries, fixedAssets] = await Promise.all([
            usecases.fiscalPeriods.getAll(userId),
            usecases.entries.getAll(userId, id),
            usecases.fixedAssets.getAll(userId, id),
          ]);
          assertNoOverlappingActiveFiscalPeriod(
            effectivePeriod,
            periods.filter((period) => period.id !== id),
          );
          assertFiscalPeriodContainsExistingData(
            effectivePeriod,
            entries,
            fixedAssets,
          );
        }
        return usecases.fiscalPeriods.patch(userId, id, patch);
      },
      start: async (id) => {
        const current = await requireOwnedFiscalPeriod(id);
        assertPeriodPhase(current, "pre_opening", "start");
        return usecases.fiscalPeriods.start(userId, id);
      },
      archive: async (id) => {
        const current = await requireOwnedFiscalPeriod(id);
        assertPeriodPhase(current, "post_closing", "archive");
        if (!current.documentsReceivedCompleted) {
          throw serverConflictError(
            `Fiscal period ${id} cannot be archived before documents are received`,
            "書類の受領を完了してから圧縮保存してください",
          );
        }
        return usecases.fiscalPeriods.archive(userId, id);
      },
      purgeArchivedData: async (id) => {
        const current = await requireOwnedFiscalPeriod(id);
        if (current.archiveStatus === "active") {
          throw serverConflictError(
            `Fiscal period ${id} must be archived before purging data`,
            "圧縮保存後の会計期間のみ実データを削除できます",
          );
        }
        return usecases.fiscalPeriods.purgeArchivedData(userId, id);
      },
      remove: async (id) => {
        const current = await requireOwnedFiscalPeriod(id);
        assertPeriodPhase(current, "pre_opening", "discard");
        await usecases.fiscalPeriods.remove(userId, id);
      },
    },
    fixedAssets: {
      getAll: async (fiscalPeriodId) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodDataAvailable(period, "read fixed assets");
        return usecases.fixedAssets.getAll(userId, fiscalPeriodId);
      },
      create: async (fiscalPeriodId, input) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhaseOneOf(
          period,
          ["pre_opening", "journalizing"],
          "create fixed asset",
        );
        assertFixedAssetCreateInput(input, period);
        return usecases.fixedAssets.create(userId, fiscalPeriodId, input);
      },
      patch: async (fiscalPeriodId, id, patch) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "update fixed asset");
        const existing = await requireOwnedFixedAsset(fiscalPeriodId, id);
        assertFixedAssetPatchInput(patch, existing);
        assertPatchedFixedAsset(existing, patch, period);
        return usecases.fixedAssets.patch(userId, id, patch);
      },
      remove: async (fiscalPeriodId, id) => {
        const period = await requireOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "delete fixed asset");
        await requireOwnedFixedAsset(fiscalPeriodId, id);
        await usecases.fixedAssets.remove(userId, id);
      },
    },
    masterData: {
      getBookAccounts: () => usecases.masterData.getBookAccounts(),
      getTaxCategories: () => usecases.masterData.getTaxCategories(),
      getBusinessCategories: () => usecases.masterData.getBusinessCategories(),
    },
  };
  return {
    ...api,
    ...serializePortOperations({
      preClosings: api.preClosings,
      closings: api.closings,
      entries: api.entries,
      fiscalPeriods: api.fiscalPeriods,
      fixedAssets: api.fixedAssets,
    }),
  };
}
