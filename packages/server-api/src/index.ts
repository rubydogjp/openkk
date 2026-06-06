import {
  assertDateRange,
  assertEntryLinesBalanced,
  assertIsoDate,
  assertNonNegativeFiniteNumber,
  assertPositiveInteger,
  assertUniqueAccountIds,
  assertUnitRate,
  serverConflictError,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
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
    if (period == null) {
      throw serverNotFoundError(`Fiscal period ${fiscalPeriodId} not found`);
    }
    return period;
  };
  return {
    auth: {
      startSession: (redirectUrl) => usecases.auth.startSession(redirectUrl),
      completeSession: ({ state, code }) =>
        usecases.auth.completeSession(state, code),
      redeemCompletionCode: async (code) => {
        await usecases.auth.redeemCompletionCode(code);
        return { userId: uid };
      },
      signOut: () => usecases.auth.signOut(),
    },
    preClosing: {
      get: async (fpId, year) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.preClosing.get(uid, fpId, year);
      },
      run: async ({ fiscalPeriodId, year }) => {
        const period = await getOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "run pre-closing");
        return usecases.preClosing.run(uid, fiscalPeriodId, year);
      },
      cancel: async (fpId, year) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "pre_closing", "cancel pre-closing");
        return usecases.preClosing.cancel(uid, fpId, year);
      },
    },
    closing: {
      get: async (fpId, year) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.closing.get(uid, fpId, year);
      },
      run: async ({ fiscalPeriodId, year }) => {
        const period = await getOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "pre_closing", "run closing");
        return usecases.closing.run(uid, fiscalPeriodId, year);
      },
    },
    entries: {
      getAll: async (fpId) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.entries.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertMutableFiscalPeriod(period, "create entry");
        assertEntryInput(input);
        return usecases.entries.create(uid, fpId, input);
      },
      patch: async (fpId, id, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertMutableFiscalPeriod(period, "update entry");
        assertEntryInput(input);
        const existing = await usecases.entries.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw serverNotFoundError(
            `Entry ${id} not found in fiscal period ${fpId}`,
          );
        }
        return usecases.entries.update(uid, id, input);
      },
      remove: async (fpId, id) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertMutableFiscalPeriod(period, "delete entry");
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
        assertMutableFiscalPeriod(period, "import entries");
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
        assertFiscalPeriodPatchInput(current, patch);
        return usecases.fiscalPeriod.update(uid, id, patch);
      },
      archive: async (id) => {
        const current = await getOwnedFiscalPeriod(id);
        assertMutableFiscalPeriod(current, "archive");
        return usecases.fiscalPeriod.archive(uid, id);
      },
      remove: async (id) => {
        await getOwnedFiscalPeriod(id);
        await usecases.fiscalPeriod.delete(uid, id);
      },
    },
    fixedAssets: {
      getAll: async (fpId) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.fixedAssets.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertMutableFiscalPeriod(period, "create fixed asset");
        assertFixedAssetCreateInput(input);
        return usecases.fixedAssets.create(uid, fpId, input);
      },
      patch: async (fpId, id, patch) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertMutableFiscalPeriod(period, "update fixed asset");
        assertFixedAssetPatchInput(patch);
        const existing = await usecases.fixedAssets.getById(uid, id);
        if (existing == null || existing.fiscalPeriodId !== fpId) {
          throw serverNotFoundError(
            `Fixed asset ${id} not found in fiscal period ${fpId}`,
          );
        }
        assertFixedAssetDisposalConsistency(existing, patch);
        return usecases.fixedAssets.update(uid, id, patch);
      },
      remove: async (fpId, id) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertMutableFiscalPeriod(period, "delete fixed asset");
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
}

function assertMutableFiscalPeriod(
  period: FiscalPeriodApiRecord,
  operation: string,
) {
  if (period.archiveStatus === "archived") {
    throw archivedFiscalPeriodError(
      `Archived fiscal period ${period.id} cannot ${operation}`,
    );
  }
}

function assertPeriodPhase(
  period: FiscalPeriodApiRecord,
  expectedPhase: FiscalPeriodApiRecord["phase"],
  operation: string,
) {
  assertMutableFiscalPeriod(period, operation);
  if (period.phase !== expectedPhase) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot ${operation} from phase ${period.phase}`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
}

function archivedFiscalPeriodError(messageForDeveloper: string) {
  return serverConflictError(
    messageForDeveloper,
    "圧縮保存済みの会計期間は変更できません",
  );
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

  const opening = patch.opening;
  if (opening != null) {
    for (const line of opening.openingBalanceLines) {
      assertNonNegativeFiniteNumber(line.amount, "Opening balance amount");
    }
    assertUniqueAccountIds(
      opening.openingBalanceLines.map((line) => line.accountId),
      "Opening balance lines",
    );
    for (const journal of opening.openingJournals) {
      assertIsoDate(journal.date, "Opening journal date");
      assertUnitRate(journal.businessRate, "Opening journal business rate");
      for (const line of journal.lines) {
        assertNonNegativeFiniteNumber(
          line.amount,
          "Opening journal line amount",
        );
      }
      assertEntryLinesBalanced(journal.lines, "Opening journal");
    }
  }
}

function assertEntryInput(input: EntryUpsertInput) {
  assertIsoDate(input.date, "Entry date");
  assertUnitRate(input.businessRate, "Entry business rate");
  for (const line of input.lines) {
    assertNonNegativeFiniteNumber(line.amount, "Entry line amount");
  }
  assertEntryLinesBalanced(input.lines, "Entry");
}

function assertFixedAssetCreateInput(input: FixedAssetCreateInput) {
  assertIsoDate(input.acquisitionDate, "Fixed asset acquisition date");
  assertNonNegativeFiniteNumber(
    input.acquisitionCost,
    "Fixed asset acquisition cost",
  );
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
    assertNonNegativeFiniteNumber(
      input.acquisitionCost,
      "Fixed asset acquisition cost",
    );
  }
  if (input.usefulLife != null) {
    assertPositiveInteger(input.usefulLife, "Fixed asset useful life");
  }
  if (input.businessRate != null) {
    assertUnitRate(input.businessRate, "Fixed asset business rate");
  }
  if (input.disposalPrice != null) {
    assertNonNegativeFiniteNumber(
      input.disposalPrice,
      "Fixed asset disposal price",
    );
  }
}

const DISPOSAL_STATUSES: ReadonlyArray<FixedAssetPatchInput["status"]> = [
  "sold",
  "disposed",
];

function assertFixedAssetDisposalConsistency(
  existing: { status: string; disposalDate: string },
  patch: FixedAssetPatchInput,
) {
  const effectiveStatus = patch.status ?? existing.status;
  const effectiveDisposalDate = patch.disposalDate ?? existing.disposalDate;
  if (
    DISPOSAL_STATUSES.includes(
      effectiveStatus as FixedAssetPatchInput["status"],
    ) &&
    effectiveDisposalDate.trim() === ""
  ) {
    throw serverValidationError(
      `Fixed asset with status ${effectiveStatus} requires a disposal date`,
      "売却・廃棄の固定資産には処分日を入力してください",
    );
  }
}
