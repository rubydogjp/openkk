import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  serverConflictError,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type { OpenkkServerPort } from "@rubydogjp/openkk-server-ports";
import type { ServerUsecases } from "@rubydogjp/openkk-server-usecases";
import {
  archivedFiscalPeriodError,
  assertClosingGeneratedEntries,
  assertClosingYear,
  assertEditableEntryInput,
  assertFiscalPeriodCreateInput,
  assertFiscalPeriodNextCreateInput,
  assertFiscalPeriodContainsExistingData,
  assertFiscalPeriodPatchAllowed,
  assertFiscalPeriodPatchInput,
  assertFiscalPeriodReadyForPreClosing,
  assertFixedAssetCreateInput,
  assertFixedAssetDisposalConsistency,
  assertFixedAssetEffectiveInput,
  assertFixedAssetPatchInput,
  assertNoOverlappingFiscalPeriod,
  assertNonBlankString,
  assertObject,
  assertPeriodDataAvailable,
  assertPeriodPhase,
  assertPeriodPhaseOneOf,
} from "./validation.js";
import { serializeDataOperations } from "./serialized-server-port.js";

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
    assertNonBlankString(fiscalPeriodId, "Fiscal period id");
    const period = (await usecases.fiscalPeriod.getAll(uid)).find(
      (candidate) => candidate.id === fiscalPeriodId,
    );
    if (period == null) {
      throw serverNotFoundError(`Fiscal period ${fiscalPeriodId} not found`);
    }
    return period;
  };
  const api: OpenkkServerPort = {
    auth: {
      startSession: (redirectUrl) => {
        assertNonBlankString(redirectUrl, "Auth redirect URL");
        return usecases.auth.startSession(redirectUrl);
      },
      completeSession: (input) => {
        assertObject(input, "Auth completion input");
        assertNonBlankString(input.state, "Auth state");
        assertNonBlankString(input.code, "Auth code");
        return usecases.auth.completeSession(input.state, input.code);
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
    preClosing: {
      get: async (fpId, year) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read pre-closing data");
        assertClosingYear(period, year);
        return usecases.preClosing.get(uid, fpId, year);
      },
      run: async (input) => {
        assertObject(input, "Pre-closing input");
        const { fiscalPeriodId, year } = input;
        const period = await getOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "run pre-closing");
        assertClosingYear(period, year);
        assertFiscalPeriodReadyForPreClosing(period);
        return usecases.preClosing.run(uid, fiscalPeriodId, year);
      },
      cancel: async (fpId, year) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "pre_closing", "cancel pre-closing");
        assertClosingYear(period, year);
        return usecases.preClosing.cancel(uid, fpId, year);
      },
    },
    closing: {
      get: async (fpId, year) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read closing data");
        assertClosingYear(period, year);
        return usecases.closing.get(uid, fpId, year);
      },
      run: async (input) => {
        assertObject(input, "Closing input");
        const { fiscalPeriodId, year, entries } = input;
        const period = await getOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "pre_closing", "run closing");
        assertClosingYear(period, year);
        assertClosingGeneratedEntries(entries, period);
        return usecases.closing.run(uid, fiscalPeriodId, year, entries);
      },
    },
    entries: {
      getAll: async (fpId) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read entries");
        return usecases.entries.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "create entry");
        assertEditableEntryInput(input, period, null);
        return usecases.entries.create(uid, fpId, input);
      },
      patch: async (fpId, id, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "update entry");
        assertNonBlankString(id, "Entry id");
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw serverNotFoundError(
            `Entry ${id} not found in fiscal period ${fpId}`,
          );
        }
        assertEditableEntryInput(input, period, existing);
        return usecases.entries.update(uid, id, input);
      },
      remove: async (fpId, id) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "delete entry");
        assertNonBlankString(id, "Entry id");
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw serverNotFoundError(
            `Entry ${id} not found in fiscal period ${fpId}`,
          );
        }
        await usecases.entries.delete(uid, id);
      },
      importMany: async (fpId, inputs) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhaseOneOf(
          period,
          ["pre_opening", "journalizing"],
          "import entries",
        );
        if (!Array.isArray(inputs)) {
          throw serverValidationError("Entry import input must be an array", null);
        }
        if (inputs.length > MAX_ENTRY_IMPORT_ITEMS) {
          throw serverValidationError(
            `Entry import exceeds the ${MAX_ENTRY_IMPORT_ITEMS} item limit`,
            "一度に取り込める仕訳件数を超えています。ファイルを分割してください",
          );
        }
        let importLineCount = 0;
        for (const input of inputs) {
          assertObject(input, "Entry input");
          if (!Array.isArray(input.lines)) {
            throw serverValidationError("Entry lines must be an array", null);
          }
          importLineCount += input.lines.length;
          if (
            !Number.isSafeInteger(importLineCount) ||
            importLineCount > MAX_ENTRY_IMPORT_LINES
          ) {
            throw serverValidationError(
              `Entry import exceeds the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
              "一度に取り込める仕訳明細数を超えています。ファイルを分割してください",
            );
          }
        }
        inputs.forEach((input) => {
          assertEditableEntryInput(input, period, null);
        });
        const entries = await usecases.entries.importMany(uid, fpId, inputs);
        return { importedCount: entries.length, entries };
      },
    },
    fiscalPeriod: {
      getAll: () => usecases.fiscalPeriod.getAll(uid),
      create: async (input) => {
        assertFiscalPeriodCreateInput(input);
        assertNoOverlappingFiscalPeriod(
          input,
          await usecases.fiscalPeriod.getAll(uid),
        );
        return usecases.fiscalPeriod.create(uid, input);
      },
      createNext: async (input) => {
        assertFiscalPeriodNextCreateInput(input);
        assertNoOverlappingFiscalPeriod(input, await usecases.fiscalPeriod.getAll(uid));
        return usecases.fiscalPeriod.createNext(uid, input);
      },
      importArchived: async (input) => {
        return usecases.fiscalPeriod.importArchived(uid, input);
      },
      patch: async (id, patch) => {
        const current = await getOwnedFiscalPeriod(id);
        if (current.archiveStatus === "archived") {
          throw archivedFiscalPeriodError(
            `Archived fiscal period ${id} cannot be updated`,
          );
        }
        assertFiscalPeriodPatchAllowed(current, patch);
        assertFiscalPeriodPatchInput(current, patch);
        if (patch.startDate != null || patch.endDate != null) {
          const effectivePeriod = {
            startDate: patch.startDate ?? current.startDate,
            endDate: patch.endDate ?? current.endDate,
          };
          const [periods, entries, fixedAssets] = await Promise.all([
            usecases.fiscalPeriod.getAll(uid),
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
        return usecases.fiscalPeriod.update(uid, id, patch);
      },
      archive: async (id) => {
        const current = await getOwnedFiscalPeriod(id);
        assertPeriodPhase(current, "post_closing", "archive");
        if (!current.documentsReceivedCompleted) {
          throw serverConflictError(
            `Fiscal period ${id} cannot be archived before documents are received`,
            "書類の受領を完了してから圧縮保存してください",
          );
        }
        return usecases.fiscalPeriod.archive(uid, id);
      },
      purgeArchivedData: async (id) => {
        const current = await getOwnedFiscalPeriod(id);
        if (current.archiveStatus !== "archived") {
          throw serverConflictError(
            `Fiscal period ${id} must be archived before purging data`,
            "圧縮保存後の会計期間のみ実データを削除できます",
          );
        }
        return usecases.fiscalPeriod.purgeArchivedData(uid, id);
      },
      remove: async (id) => {
        const current = await getOwnedFiscalPeriod(id);
        assertPeriodPhase(current, "pre_opening", "discard");
        await usecases.fiscalPeriod.delete(uid, id);
      },
    },
    fixedAssets: {
      getAll: async (fpId) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodDataAvailable(period, "read fixed assets");
        return usecases.fixedAssets.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhaseOneOf(
          period,
          ["pre_opening", "journalizing"],
          "create fixed asset",
        );
        assertFixedAssetCreateInput(input, period);
        return usecases.fixedAssets.create(uid, fpId, input);
      },
      patch: async (fpId, id, patch) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "update fixed asset");
        assertNonBlankString(id, "Fixed asset id");
        const existing = await usecases.fixedAssets.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw serverNotFoundError(
            `Fixed asset ${id} not found in fiscal period ${fpId}`,
          );
        }
        assertFixedAssetPatchInput(patch, existing);
        assertFixedAssetDisposalConsistency(existing, patch);
        assertFixedAssetEffectiveInput(existing, patch, period);
        return usecases.fixedAssets.update(uid, id, patch);
      },
      remove: async (fpId, id) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "delete fixed asset");
        assertNonBlankString(id, "Fixed asset id");
        const existing = await usecases.fixedAssets.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw serverNotFoundError(
            `Fixed asset ${id} not found in fiscal period ${fpId}`,
          );
        }
        await usecases.fixedAssets.delete(uid, id);
      },
    },
    masterData: {
      getBookAccounts: () => usecases.masterData.getBookAccounts(),
      getTaxCategories: () => usecases.masterData.getTaxCategories(),
      getBusinessCategories: () => usecases.masterData.getBusinessCategories(),
    },
  };
  return serializeDataOperations(api);
}
