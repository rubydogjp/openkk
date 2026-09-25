import {
  assertEntryCollectionItemLimit,
  assertEntryCollectionLineLimit,
  assertFiscalPeriodPatchMatchesPhase,
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
  assertClosingYear,
  assertFiscalPeriodCreateInput,
  assertFiscalPeriodNextCreateInput,
  assertFiscalPeriodContainsExistingData,
  assertFiscalPeriodPatchInput,
  assertFiscalPeriodReadyForPreClosing,
  assertNoOverlappingFiscalPeriod,
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
  const uid = config.userId;
  const requireOwnedFiscalPeriod = async (fiscalPeriodId: string) => {
    assertNonBlankString(fiscalPeriodId, "Fiscal period id");
    const period = await usecases.fiscalPeriods.getById(uid, fiscalPeriodId);
    if (period == null) {
      throw serverNotFoundError(`Fiscal period ${fiscalPeriodId} not found`);
    }
    return period;
  };
  const requireOwnedEntry = async (fiscalPeriodId: string, id: string) => {
    assertNonBlankString(id, "Entry id");
    const entry = await usecases.entries.getById(uid, id);
    if (entry == null || entry.fiscalPeriodId !== fiscalPeriodId) {
      throw serverNotFoundError(
        `Entry ${id} not found in fiscal period ${fiscalPeriodId}`,
      );
    }
    return entry;
  };
  const requireOwnedFixedAsset = async (fiscalPeriodId: string, id: string) => {
    assertNonBlankString(id, "Fixed asset id");
    const asset = await usecases.fixedAssets.getById(uid, id);
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
          userId: uid,
          displayName: null,
          email: null,
          iconUrl: null,
          authProvider: null,
        };
      },
      signOut: () => usecases.auth.signOut(),
    },
    preClosings: {
      get: async (fpId, year) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read pre-closing data");
        assertClosingYear(period, year);
        return usecases.preClosings.get(uid, fpId, year);
      },
      run: async (fpId, year) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "run pre-closing");
        assertClosingYear(period, year);
        assertFiscalPeriodReadyForPreClosing(period);
        return usecases.preClosings.run(uid, fpId, year);
      },
      cancel: async (fpId, year) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "pre_closing", "cancel pre-closing");
        assertClosingYear(period, year);
        return usecases.preClosings.cancel(uid, fpId, year);
      },
    },
    closings: {
      get: async (fpId, year) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read closing data");
        assertClosingYear(period, year);
        return usecases.closings.get(uid, fpId, year);
      },
      run: async (fpId, year, entries) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "pre_closing", "run closing");
        assertClosingYear(period, year);
        assertClosingGeneratedEntries(entries, period);
        return usecases.closings.run(uid, fpId, year, entries);
      },
    },
    entries: {
      getAll: async (fpId) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read entries");
        return usecases.entries.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "create entry");
        assertEditableEntryInput(input, period, null);
        return usecases.entries.create(uid, fpId, input);
      },
      update: async (fpId, id, input) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "update entry");
        const existing = await requireOwnedEntry(fpId, id);
        assertEditableEntryInput(input, period, existing);
        return usecases.entries.update(uid, id, input);
      },
      remove: async (fpId, id) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "delete entry");
        await requireOwnedEntry(fpId, id);
        await usecases.entries.remove(uid, id);
      },
      importMany: async (fpId, inputs) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhaseOneOf(
          period,
          ["pre_opening", "journalizing"],
          "import entries",
        );
        if (!Array.isArray(inputs)) {
          throw serverValidationError("Entry import input must be an array", null);
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
        const entries = await usecases.entries.importMany(uid, fpId, inputs);
        return { importedCount: entries.length, entries };
      },
    },
    fiscalPeriods: {
      getAll: () => usecases.fiscalPeriods.getAll(uid),
      create: async (input) => {
        assertFiscalPeriodCreateInput(input);
        assertNoOverlappingFiscalPeriod(
          input,
          await usecases.fiscalPeriods.getAll(uid),
        );
        return usecases.fiscalPeriods.create(uid, input);
      },
      createNext: async (input) => {
        assertFiscalPeriodNextCreateInput(input);
        assertNoOverlappingFiscalPeriod(input, await usecases.fiscalPeriods.getAll(uid));
        return usecases.fiscalPeriods.createNext(uid, input);
      },
      importArchived: async (input) => {
        return usecases.fiscalPeriods.importArchived(uid, input);
      },
      patch: async (id, patch) => {
        const current = await requireOwnedFiscalPeriod(id);
        if (current.archiveStatus !== "active") {
          throw archivedFiscalPeriodError(
            `Archived fiscal period ${id} cannot be updated`,
          );
        }
        assertFiscalPeriodPatchMatchesPhase(current, patch);
        assertFiscalPeriodPatchInput(current, patch);
        if (patch.startDate != null || patch.endDate != null) {
          const effectivePeriod = {
            startDate: patch.startDate ?? current.startDate,
            endDate: patch.endDate ?? current.endDate,
          };
          const [periods, entries, fixedAssets] = await Promise.all([
            usecases.fiscalPeriods.getAll(uid),
            usecases.entries.getAll(uid, id),
            usecases.fixedAssets.getAll(uid, id),
          ]);
          assertNoOverlappingFiscalPeriod(
            effectivePeriod,
            periods.filter((period) => period.id !== id),
          );
          assertFiscalPeriodContainsExistingData(
            effectivePeriod,
            entries,
            fixedAssets,
          );
        }
        return usecases.fiscalPeriods.patch(uid, id, patch);
      },
      start: async (id) => {
        const current = await requireOwnedFiscalPeriod(id);
        assertPeriodPhase(current, "pre_opening", "start");
        return usecases.fiscalPeriods.start(uid, id);
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
        return usecases.fiscalPeriods.archive(uid, id);
      },
      purgeArchivedData: async (id) => {
        const current = await requireOwnedFiscalPeriod(id);
        if (current.archiveStatus === "active") {
          throw serverConflictError(
            `Fiscal period ${id} must be archived before purging data`,
            "圧縮保存後の会計期間のみ実データを削除できます",
          );
        }
        return usecases.fiscalPeriods.purgeArchivedData(uid, id);
      },
      remove: async (id) => {
        const current = await requireOwnedFiscalPeriod(id);
        assertPeriodPhase(current, "pre_opening", "discard");
        await usecases.fiscalPeriods.remove(uid, id);
      },
    },
    fixedAssets: {
      getAll: async (fpId) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read fixed assets");
        return usecases.fixedAssets.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhaseOneOf(
          period,
          ["pre_opening", "journalizing"],
          "create fixed asset",
        );
        assertFixedAssetCreateInput(input, period);
        return usecases.fixedAssets.create(uid, fpId, input);
      },
      patch: async (fpId, id, patch) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "update fixed asset");
        const existing = await requireOwnedFixedAsset(fpId, id);
        assertFixedAssetPatchInput(patch, existing);
        assertPatchedFixedAsset(existing, patch, period);
        return usecases.fixedAssets.patch(uid, id, patch);
      },
      remove: async (fpId, id) => {
        const period = await requireOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "delete fixed asset");
        await requireOwnedFixedAsset(fpId, id);
        await usecases.fixedAssets.remove(uid, id);
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
