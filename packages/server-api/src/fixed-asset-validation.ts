import {
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertPositiveInteger,
  assertUnitRate,
  computeFixedAssetBookValue,
  getDefaultBookAccount,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  FiscalPeriodApiRecord,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
} from "@rubydogjp/openkk-server-ports";
import {
  assertNonBlankString,
  assertObject,
  assertString,
} from "./common-validation.js";

export function assertFixedAssetCreateInput(
  input: FixedAssetCreateInput,
  period: FiscalPeriodApiRecord,
): void {
  assertObject(input, "Fixed asset input");
  assertNonBlankString(input.name, "Fixed asset name");
  assertNonBlankString(input.bookAccountId, "Fixed asset book account");
  if (input.depreciationMethod !== "straight_line") {
    throw serverValidationError("Fixed asset depreciation method is invalid");
  }
  assertIsoDate(input.acquisitionDate, "Fixed asset acquisition date");
  assertPositiveInteger(input.acquisitionCost, "Fixed asset acquisition cost");
  assertFixedAssetUsefulLife(input.usefulLife);
  assertUnitRate(input.businessRate, "Fixed asset business rate");
  assertFixedAssetAccount(input.bookAccountId);
  if (input.acquisitionDate > period.endDate) {
    throw serverValidationError(
      `Fixed asset acquisition date ${input.acquisitionDate} must not be after fiscal period end ${period.endDate}`,
      "固定資産の取得日は会計期間の終了日以前にしてください",
    );
  }
}

export function assertFixedAssetPatchInput(input: FixedAssetPatchInput): void {
  assertObject(input, "Fixed asset patch");
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
  if (
    input.status != null &&
    !FIXED_ASSET_STATUSES.includes(input.status)
  ) {
    throw serverValidationError("Fixed asset status is invalid");
  }
  if (input.acquisitionDate != null) {
    assertString(input.acquisitionDate, "Fixed asset acquisition date");
    assertIsoDate(input.acquisitionDate, "Fixed asset acquisition date");
  }
  if (input.disposalDate != null) {
    assertString(input.disposalDate, "Fixed asset disposal date");
    if (input.disposalDate !== "") {
      assertIsoDate(input.disposalDate, "Fixed asset disposal date");
    }
  }
  if (input.acquisitionCost != null) {
    assertPositiveInteger(
      input.acquisitionCost,
      "Fixed asset acquisition cost",
    );
  }
  if (input.usefulLife != null) {
    assertFixedAssetUsefulLife(input.usefulLife);
  }
  if (input.businessRate != null) {
    assertUnitRate(input.businessRate, "Fixed asset business rate");
  }
  if (input.disposalPrice != null) {
    assertNonNegativeSafeInteger(
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

export function assertFixedAssetDisposalConsistency(
  existing: {
    status: string;
    acquisitionDate: string;
    disposalDate: string;
    disposalPrice: number;
  },
  patch: FixedAssetPatchInput,
): void {
  const effectiveStatus = patch.status ?? existing.status;
  const effectiveAcquisitionDate =
    patch.acquisitionDate ?? existing.acquisitionDate;
  const effectiveDisposalDate = patch.disposalDate ?? existing.disposalDate;
  const effectiveDisposalPrice = patch.disposalPrice ?? existing.disposalPrice;
  const isDisposalStatus = DISPOSAL_STATUSES.includes(
    effectiveStatus as FixedAssetPatchInput["status"],
  );
  if (isDisposalStatus && effectiveDisposalDate.trim() === "") {
    throw serverValidationError(
      `Fixed asset with status ${effectiveStatus} requires a disposal date`,
      "売却・廃棄の固定資産には処分日を入力してください",
    );
  }
  if (!isDisposalStatus && effectiveDisposalDate.trim() !== "") {
    throw serverValidationError(
      `Fixed asset with status ${effectiveStatus} must not have a disposal date`,
      "償却中・完了の固定資産には処分日を設定できません",
    );
  }
  if (effectiveStatus !== "sold" && effectiveDisposalPrice !== 0) {
    throw serverValidationError(
      `Fixed asset with status ${effectiveStatus} must not have a disposal price`,
      "売却済以外の固定資産には売却額を設定できません",
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

export function assertFixedAssetEffectiveInput(
  existing: FixedAssetApiRecord,
  patch: FixedAssetPatchInput,
  period: FiscalPeriodApiRecord,
): void {
  const acquisitionDate = patch.acquisitionDate ?? existing.acquisitionDate;
  const disposalDate = patch.disposalDate ?? existing.disposalDate;
  const status = patch.status ?? existing.status;
  const bookAccountId = patch.bookAccountId ?? existing.bookAccountId;
  const acquisitionCost = patch.acquisitionCost ?? existing.acquisitionCost;
  const usefulLife = patch.usefulLife ?? existing.usefulLife;
  assertPositiveInteger(acquisitionCost, "Fixed asset acquisition cost");
  assertFixedAssetUsefulLife(usefulLife);
  assertFixedAssetAccount(bookAccountId);
  if (acquisitionDate > period.endDate) {
    throw serverValidationError(
      `Fixed asset acquisition date ${acquisitionDate} must not be after fiscal period end ${period.endDate}`,
      "固定資産の取得日は会計期間の終了日以前にしてください",
    );
  }
  if (
    (status === "sold" || status === "disposed") &&
    (disposalDate < period.startDate || disposalDate > period.endDate)
  ) {
    throw serverValidationError(
      `Fixed asset disposal date ${disposalDate} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "固定資産の処分日は会計期間内にしてください",
    );
  }
  if (
    status === "retired" &&
    computeFixedAssetBookValue({
      acquisitionDate,
      acquisitionCost,
      usefulLife,
      asOf: period.endDate,
    }) > 1
  ) {
    throw serverValidationError(
      `Fixed asset cannot be retired before it reaches memorandum value at fiscal period end ${period.endDate}`,
      "期末時点で償却が完了していない固定資産は完了にできません",
    );
  }
}

function assertFixedAssetAccount(bookAccountId: string): void {
  const account = getDefaultBookAccount(bookAccountId);
  if (
    account == null ||
    account.accountType !== "asset" ||
    account.balanceSheetSection !== "fixed_asset"
  ) {
    throw serverValidationError(
      `Fixed asset book account must reference a fixed-asset account: ${bookAccountId}`,
      "固定資産の勘定科目が不正です",
    );
  }
}

function assertFixedAssetUsefulLife(value: number): void {
  assertPositiveInteger(value, "Fixed asset useful life");
  if (value > MAX_FIXED_ASSET_USEFUL_LIFE_YEARS) {
    throw serverValidationError(
      `Fixed asset useful life must not exceed ${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS} years`,
      `固定資産の耐用年数は${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS}年以下にしてください`,
    );
  }
}
