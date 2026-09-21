import { serverValidationError } from "./app-error.js";
import { computeFixedAssetBookValue } from "./closing-entries.js";
import { getDefaultBookAccount } from "./master-data.js";
import {
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertPositiveInteger,
  assertUnitRate,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
} from "./validation.js";

export type FixedAssetRuleInput = {
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: "active" | "sold" | "disposed" | "retired";
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
};

const FIXED_ASSET_STATUSES: ReadonlyArray<FixedAssetRuleInput["status"]> = [
  "active",
  "sold",
  "disposed",
  "retired",
];

export function assertFixedAssetMatchesRules(
  asset: FixedAssetRuleInput,
  period: { startDate: string; endDate: string } | null,
): void {
  if (typeof asset.name !== "string" || asset.name.trim() === "") {
    throw serverValidationError(
      "Fixed asset name is required",
      "固定資産の名称を入力してください",
    );
  }
  if (!FIXED_ASSET_STATUSES.includes(asset.status)) {
    throw serverValidationError(
      "Fixed asset status is invalid",
      "固定資産の状態が不正です",
    );
  }
  if (asset.depreciationMethod !== "straight_line") {
    throw serverValidationError(
      "Fixed asset depreciation method is invalid",
      "固定資産の償却方法が不正です",
    );
  }
  assertDateText(asset.acquisitionDate, "Fixed asset acquisition date");
  assertPositiveInteger(asset.acquisitionCost, "Fixed asset acquisition cost");
  assertPositiveInteger(asset.usefulLife, "Fixed asset useful life");
  if (asset.usefulLife > MAX_FIXED_ASSET_USEFUL_LIFE_YEARS) {
    throw serverValidationError(
      `Fixed asset useful life must not exceed ${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS} years`,
      `固定資産の耐用年数は${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS}年以下にしてください`,
    );
  }
  assertUnitRate(asset.businessRate, "Fixed asset business rate");
  assertFixedAssetAccount(asset.bookAccountId);
  assertFixedAssetDisposal(asset);
  if (period == null) return;
  if (asset.acquisitionDate > period.endDate) {
    throw serverValidationError(
      `Fixed asset acquisition date ${asset.acquisitionDate} must not be after fiscal period end ${period.endDate}`,
      "固定資産の取得日は会計期間の終了日以前にしてください",
    );
  }
  if (
    asset.disposalDate != null &&
    (asset.disposalDate < period.startDate ||
      asset.disposalDate > period.endDate)
  ) {
    throw serverValidationError(
      `Fixed asset disposal date ${asset.disposalDate} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "固定資産の処分日は会計期間内にしてください",
    );
  }
  if (
    asset.status === "retired" &&
    computeFixedAssetBookValue({
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCost,
      usefulLife: asset.usefulLife,
      asOf: period.endDate,
    }) > 1
  ) {
    throw serverValidationError(
      `Fixed asset cannot be retired before it reaches memorandum value at fiscal period end ${period.endDate}`,
      "期末時点で償却が完了していない固定資産は完了にできません",
    );
  }
}

function assertFixedAssetDisposal(asset: FixedAssetRuleInput): void {
  if (asset.disposalDate !== null) {
    assertDateText(asset.disposalDate, "Fixed asset disposal date");
  }
  if (asset.disposalPrice !== null) {
    assertNonNegativeSafeInteger(
      asset.disposalPrice,
      "Fixed asset disposal price",
    );
  }
  const disposed = asset.status === "sold" || asset.status === "disposed";
  if (disposed && asset.disposalDate == null) {
    throw serverValidationError(
      `Fixed asset with status ${asset.status} requires a disposal date`,
      "売却・廃棄の固定資産には処分日を入力してください",
    );
  }
  if (!disposed && asset.disposalDate != null) {
    throw serverValidationError(
      `Fixed asset with status ${asset.status} must not have a disposal date`,
      "償却中・完了の固定資産には処分日を設定できません",
    );
  }
  if (asset.status === "sold" && asset.disposalPrice == null) {
    throw serverValidationError(
      "Fixed asset with status sold requires a disposal price",
      "売却済の固定資産には売却額を入力してください",
    );
  }
  if (asset.status !== "sold" && asset.disposalPrice != null) {
    throw serverValidationError(
      `Fixed asset with status ${asset.status} must not have a disposal price`,
      "売却済以外の固定資産には売却額を設定できません",
    );
  }
  if (asset.disposalDate == null) return;
  if (asset.disposalDate < asset.acquisitionDate) {
    throw serverValidationError(
      `Fixed asset disposal date ${asset.disposalDate} must not be before acquisition date ${asset.acquisitionDate}`,
      "固定資産の処分日は取得日以降にしてください",
    );
  }
}

function assertDateText(value: string, label: string): void {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
  assertIsoDate(value, label);
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
