import { engineValidationError } from "./app-error.js";
import { computeFixedAssetBookValue } from "./closing-entries.js";
import { getDefaultBookAccount } from "./master-data.js";
import type {
  FixedAsset,
  FixedAssetDisposalProceedsTo,
  FixedAssetStatus,
} from "./models.js";
import {
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertPositiveInteger,
  assertUnitRate,
  isNonBlankString,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
  requireObject,
} from "./validation.js";

export const FIXED_ASSET_PATCH_KEYS = [
  "name",
  "acquisitionDate",
  "acquisitionCost",
  "usefulLife",
  "depreciationMethod",
  "businessRate",
  "status",
  "disposalDate",
  "disposalPrice",
  "disposalProceedsTo",
  "bookAccountId",
] as const;

const FIXED_ASSET_STATUSES: ReadonlyArray<FixedAssetStatus> = [
  "active",
  "sold",
  "disposed",
  "retired",
];

export const FIXED_ASSET_DISPOSAL_PROCEEDS_DESTINATIONS: ReadonlyArray<FixedAssetDisposalProceedsTo> =
  ["bank", "cash", "owner"];

function isFixedAssetStatus(value: unknown): value is FixedAssetStatus {
  return FIXED_ASSET_STATUSES.some((status) => status === value);
}

function isDisposalProceedsTo(
  value: unknown,
): value is FixedAssetDisposalProceedsTo {
  return FIXED_ASSET_DISPOSAL_PROCEEDS_DESTINATIONS.some(
    (destination) => destination === value,
  );
}

export function assertFixedAssetMatchesRules(
  asset: unknown,
  period: { startDate: string; endDate: string },
): asserts asset is FixedAsset {
  const value = requireObject(asset, "Fixed asset");
  if (!isNonBlankString(value.name)) {
    throw engineValidationError(
      "Fixed asset name is required",
      "固定資産の名称を入力してください",
    );
  }
  if (!isFixedAssetStatus(value.status)) {
    throw engineValidationError(
      "Fixed asset status is invalid",
      "固定資産の状態が不正です",
    );
  }
  if (value.depreciationMethod !== "straight_line") {
    throw engineValidationError(
      "Fixed asset depreciation method is invalid",
      "固定資産の償却方法が不正です",
    );
  }
  assertIsoDate(value.acquisitionDate, "Fixed asset acquisition date");
  assertPositiveInteger(value.acquisitionCost, "Fixed asset acquisition cost");
  assertPositiveInteger(value.usefulLife, "Fixed asset useful life");
  if (value.usefulLife > MAX_FIXED_ASSET_USEFUL_LIFE_YEARS) {
    throw engineValidationError(
      `Fixed asset useful life must not exceed ${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS} years`,
      `固定資産の耐用年数は${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS}年以下にしてください`,
    );
  }
  assertUnitRate(value.businessRate, "Fixed asset business rate");
  assertFixedAssetAccount(value.bookAccountId);
  assertFixedAssetDisposal({
    status: value.status,
    acquisitionDate: value.acquisitionDate,
    disposalDate: value.disposalDate,
    disposalPrice: value.disposalPrice,
    disposalProceedsTo: value.disposalProceedsTo,
  });
  if (value.acquisitionDate > period.endDate) {
    throw engineValidationError(
      `Fixed asset acquisition date ${value.acquisitionDate} must not be after fiscal period end ${period.endDate}`,
      "固定資産の取得日は会計期間の終了日以前にしてください",
    );
  }
  if (
    value.disposalDate != null &&
    (value.disposalDate < period.startDate ||
      value.disposalDate > period.endDate)
  ) {
    throw engineValidationError(
      `Fixed asset disposal date ${value.disposalDate} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "固定資産の処分日は会計期間内にしてください",
    );
  }
  if (
    value.status === "retired" &&
    computeFixedAssetBookValue({
      acquisitionDate: value.acquisitionDate,
      acquisitionCost: value.acquisitionCost,
      usefulLife: value.usefulLife,
      asOf: period.endDate,
    }) > 1
  ) {
    throw engineValidationError(
      `Fixed asset cannot be retired before it reaches memorandum value at fiscal period end ${period.endDate}`,
      "期末時点で償却が完了していない固定資産は完了にできません",
    );
  }
}

function assertFixedAssetDisposal(asset: {
  status: FixedAssetStatus;
  acquisitionDate: string;
  disposalDate: unknown;
  disposalPrice: unknown;
  disposalProceedsTo: unknown;
}): void {
  const status = asset.status;
  if (asset.disposalDate !== null) {
    assertIsoDate(asset.disposalDate, "Fixed asset disposal date");
  }
  if (asset.disposalPrice !== null) {
    assertNonNegativeSafeInteger(
      asset.disposalPrice,
      "Fixed asset disposal price",
    );
  }
  const disposed = status === "sold" || status === "disposed";
  if (disposed && asset.disposalDate == null) {
    throw engineValidationError(
      `Fixed asset with status ${status} requires a disposal date`,
      "売却・廃棄の固定資産には処分日を入力してください",
    );
  }
  if (!disposed && asset.disposalDate != null) {
    throw engineValidationError(
      `Fixed asset with status ${status} must not have a disposal date`,
      "償却中・償却済みの固定資産には処分日を設定できません",
    );
  }
  if (status === "sold" && asset.disposalPrice == null) {
    throw engineValidationError(
      "Fixed asset with status sold requires a disposal price",
      "売却済みの固定資産には売却額を入力してください",
    );
  }
  if (status !== "sold" && asset.disposalPrice != null) {
    throw engineValidationError(
      `Fixed asset with status ${status} must not have a disposal price`,
      "売却済み以外の固定資産には売却額を設定できません",
    );
  }
  if (
    asset.disposalProceedsTo !== null &&
    (status !== "sold" || !isDisposalProceedsTo(asset.disposalProceedsTo))
  ) {
    throw engineValidationError(
      `Fixed asset with status ${status} cannot have disposal proceeds destination ${String(asset.disposalProceedsTo)}`,
      "売却の代金の入った先が不正です",
    );
  }
  if (typeof asset.disposalDate !== "string") return;
  if (asset.disposalDate < asset.acquisitionDate) {
    throw engineValidationError(
      `Fixed asset disposal date ${asset.disposalDate} must not be before acquisition date ${asset.acquisitionDate}`,
      "固定資産の処分日は取得日以降にしてください",
    );
  }
}

function assertFixedAssetAccount(bookAccountId: unknown): void {
  const account =
    typeof bookAccountId === "string"
      ? getDefaultBookAccount(bookAccountId)
      : null;
  if (
    account == null ||
    account.accountType !== "asset" ||
    account.balanceSheetSection !== "fixed_asset"
  ) {
    throw engineValidationError(
      `Fixed asset book account must reference a fixed-asset account: ${String(bookAccountId)}`,
      "固定資産の勘定科目が不正です",
    );
  }
}

export const DEPRECIABLE_FIXED_ASSET_ACCOUNT_NAMES: ReadonlySet<string> =
  new Set([
    "建物",
    "建物附属設備",
    "構築物",
    "機械装置",
    "車両運搬具",
    "工具器具備品",
    "その他の有形固定資産",
    "ソフトウエア",
    "その他の無形固定資産",
  ]);

export function assertDepreciableFixedAssetAccount(
  bookAccountId: unknown,
): void {
  const account =
    typeof bookAccountId === "string"
      ? getDefaultBookAccount(bookAccountId)
      : null;
  if (
    account == null ||
    !DEPRECIABLE_FIXED_ASSET_ACCOUNT_NAMES.has(account.name)
  ) {
    throw engineValidationError(
      `Fixed asset book account must be a depreciable account: ${String(bookAccountId)}`,
      "固定資産の勘定科目は、減価償却する科目から選んでください",
    );
  }
}
