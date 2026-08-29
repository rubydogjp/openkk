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
        const period = await getOwnedFiscalPeriod(fpId);
        assertClosingYear(period, year);
        return usecases.preClosing.get(uid, fpId, year);
      },
      run: async ({ fiscalPeriodId, year }) => {
        const period = await getOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "journalizing", "run pre-closing");
        assertClosingYear(period, year);
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
        assertClosingYear(period, year);
        return usecases.closing.get(uid, fpId, year);
      },
      run: async ({ fiscalPeriodId, year, entries }) => {
        const period = await getOwnedFiscalPeriod(fiscalPeriodId);
        assertPeriodPhase(period, "pre_closing", "run closing");
        assertClosingYear(period, year);
        assertClosingGeneratedEntries(entries, period);
        return usecases.closing.run(uid, fiscalPeriodId, year, entries);
      },
    },
    entries: {
      getAll: async (fpId) => {
        await getOwnedFiscalPeriod(fpId);
        return usecases.entries.getAll(uid, fpId);
      },
      create: async (fpId, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "create entry");
        assertEntryInput(input, period);
        return usecases.entries.create(uid, fpId, input);
      },
      patch: async (fpId, id, input) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "update entry");
        assertEntryInput(input, period);
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
        assertPeriodPhase(period, "journalizing", "delete entry");
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
        inputs.forEach((input) => assertEntryInput(input, period));
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
        assertFiscalPeriodPatchAllowed(current, patch);
        assertFiscalPeriodPatchInput(current, patch);
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
        assertPeriodPhaseOneOf(
          period,
          ["pre_opening", "journalizing"],
          "create fixed asset",
        );
        assertFixedAssetCreateInput(input);
        return usecases.fixedAssets.create(uid, fpId, input);
      },
      patch: async (fpId, id, patch) => {
        const period = await getOwnedFiscalPeriod(fpId);
        assertPeriodPhase(period, "journalizing", "update fixed asset");
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
        assertPeriodPhase(period, "journalizing", "delete fixed asset");
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

function assertPeriodPhaseOneOf(
  period: FiscalPeriodApiRecord,
  expectedPhases: FiscalPeriodApiRecord["phase"][],
  operation: string,
) {
  assertMutableFiscalPeriod(period, operation);
  if (!expectedPhases.includes(period.phase)) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot ${operation} from phase ${period.phase}`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
}

function assertClosingYear(period: FiscalPeriodApiRecord, year: number) {
  assertPositiveInteger(year, "Closing year");
  const expectedYear = Number(period.endDate.slice(0, 4));
  if (year !== expectedYear) {
    throw serverValidationError(
      `Closing year ${year} must match fiscal period end year ${expectedYear}`,
      "締め年度が会計期間の終了年と一致しません",
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
  assertNonBlankString(input.name, "Fiscal period name");
  assertDateRange(input.startDate, input.endDate, "Fiscal period");
}

function assertFiscalPeriodPatchInput(
  current: FiscalPeriodApiRecord,
  patch: FiscalPeriodPatchInput,
) {
  const startDate = patch.startDate ?? current.startDate;
  const endDate = patch.endDate ?? current.endDate;
  if (patch.name != null) {
    assertNonBlankString(patch.name, "Fiscal period name");
  }
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
      // 再振替の新規作成では、編集開始用の借貸 0 円の下書きを保存する。
      // 借貸行の存在と一致は必須のまま、期首仕訳に限ってゼロを許可する。
      assertEntryLinesBalanced(journal.lines, "Opening journal", {
        allowZero: true,
      });
    }
  }
}

function assertFiscalPeriodPatchAllowed(
  current: FiscalPeriodApiRecord,
  patch: FiscalPeriodPatchInput,
) {
  const changedKeys = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  const allowedKeysByPhase: Record<
    FiscalPeriodApiRecord["phase"],
    ReadonlySet<string>
  > = {
    pre_opening: new Set([
      "name",
      "startDate",
      "endDate",
      "settingsCompleted",
      "openingBalancesCompleted",
      "opening",
    ]),
    journalizing: new Set(["openingBalancesCompleted", "opening"]),
    pre_closing: new Set(),
    post_closing: new Set(["documentsReceivedCompleted"]),
  };
  if (current.phase === "pre_closing") {
    throw serverConflictError(
      `Fiscal period ${current.id} cannot be updated from phase pre_closing`,
      "仮締め中の会計期間は変更できません",
    );
  }
  if (
    current.phase === "post_closing" &&
    (changedKeys.length !== 1 ||
      changedKeys[0] !== "documentsReceivedCompleted" ||
      patch.documentsReceivedCompleted !== true)
  ) {
    throw serverConflictError(
      `Fiscal period ${current.id} only allows document receipt completion after closing`,
      "本締め後は書類受領の完了以外を変更できません",
    );
  }
  const disallowedKey = changedKeys.find(
    (key) => !allowedKeysByPhase[current.phase].has(key),
  );
  if (disallowedKey != null) {
    throw serverConflictError(
      `Fiscal period ${current.id} cannot update ${disallowedKey} from phase ${current.phase}`,
      "開始後は会計期間の設定を変更できません",
    );
  }
}

function assertEntryInput(
  input: EntryUpsertInput,
  period: FiscalPeriodApiRecord,
  allowClosingGenerated = false,
) {
  assertNonBlankString(input.description, "Entry description");
  assertIsoDate(input.date, "Entry date");
  if (input.date < period.startDate || input.date > period.endDate) {
    throw serverValidationError(
      `Entry date ${input.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "仕訳日付を会計期間内にしてください",
    );
  }
  if (
    !allowClosingGenerated &&
    typeof input.localId === "string" &&
    input.localId.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX)
  ) {
    throw serverValidationError(
      `Entry localId prefix ${CLOSING_GENERATED_LOCAL_ID_PREFIX} is reserved`,
      "この仕訳識別子は本締め用に予約されています",
    );
  }
  assertUnitRate(input.businessRate, "Entry business rate");
  if (!Array.isArray(input.lines)) {
    throw serverValidationError("Entry lines must be an array");
  }
  for (const line of input.lines) {
    if (line == null || typeof line !== "object") {
      throw serverValidationError("Entry line must be an object");
    }
    assertNonBlankString(line.bookAccountId, "Entry line book account");
    assertNonNegativeFiniteNumber(line.amount, "Entry line amount");
  }
  assertEntryLinesBalanced(input.lines, "Entry");
}

const CLOSING_GENERATED_LOCAL_ID_PREFIX = "virtual:";

function assertClosingGeneratedEntries(
  entries: EntryUpsertInput[] | undefined,
  period: FiscalPeriodApiRecord,
) {
  if (!Array.isArray(entries)) {
    throw serverValidationError(
      "Closing entries must be an array",
      "本締め用の自動仕訳データが不正です",
    );
  }
  const localIds = new Set<string>();
  for (const entry of entries) {
    if (entry == null || typeof entry !== "object") {
      throw serverValidationError("Closing entry must be an object");
    }
    if (
      typeof entry.localId !== "string" ||
      !entry.localId.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX)
    ) {
      throw serverValidationError(
        "Closing entries must use a reserved generated localId",
        "本締め用の自動仕訳識別子が不正です",
      );
    }
    if (localIds.has(entry.localId)) {
      throw serverValidationError(
        `Closing entries contain duplicate localId: ${entry.localId}`,
        "本締め用の自動仕訳が重複しています",
      );
    }
    localIds.add(entry.localId);
    assertEntryInput(entry, period, true);
  }
}

function assertFixedAssetCreateInput(input: FixedAssetCreateInput) {
  assertNonBlankString(input.name, "Fixed asset name");
  assertNonBlankString(input.bookAccountId, "Fixed asset book account");
  if (input.depreciationMethod !== "straight_line") {
    throw serverValidationError("Fixed asset depreciation method is invalid");
  }
  assertIsoDate(input.acquisitionDate, "Fixed asset acquisition date");
  assertNonNegativeFiniteNumber(
    input.acquisitionCost,
    "Fixed asset acquisition cost",
  );
  assertPositiveInteger(input.usefulLife, "Fixed asset useful life");
  assertUnitRate(input.businessRate, "Fixed asset business rate");
}

function assertFixedAssetPatchInput(input: FixedAssetPatchInput) {
  if (input.name != null) {
    assertNonBlankString(input.name, "Fixed asset name");
  }
  if (input.bookAccountId != null) {
    assertNonBlankString(input.bookAccountId, "Fixed asset book account");
  }
  if (
    input.depreciationMethod != null &&
    input.depreciationMethod !== "straight_line"
  ) {
    throw serverValidationError("Fixed asset depreciation method is invalid");
  }
  if (input.status != null && !FIXED_ASSET_STATUSES.includes(input.status)) {
    throw serverValidationError("Fixed asset status is invalid");
  }
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
const FIXED_ASSET_STATUSES: ReadonlyArray<
  NonNullable<FixedAssetPatchInput["status"]>
> = ["active", "sold", "disposed", "retired"];

function assertFixedAssetDisposalConsistency(
  existing: {
    status: string;
    acquisitionDate: string;
    disposalDate: string;
  },
  patch: FixedAssetPatchInput,
) {
  const effectiveStatus = patch.status ?? existing.status;
  const effectiveAcquisitionDate =
    patch.acquisitionDate ?? existing.acquisitionDate;
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
  if (
    effectiveDisposalDate.trim() !== "" &&
    effectiveDisposalDate < effectiveAcquisitionDate
  ) {
    throw serverValidationError(
      `Fixed asset disposal date ${effectiveDisposalDate} must not be before acquisition date ${effectiveAcquisitionDate}`,
      "固定資産の処分日は取得日以降にしてください",
    );
  }
}

function assertNonBlankString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw serverValidationError(`${label} is required`);
  }
}
