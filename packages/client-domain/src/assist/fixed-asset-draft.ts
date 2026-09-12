import {
  type FixedAsset,
  type FixedAssetDraft,
} from "./fixed-asset-data.js";
import { computePeriodDepreciation } from "./fixed-asset-depreciation.js";
import { parseAmount, parseIsoLocalDate } from "../shared/parse-utils.js";

export const MAX_FIXED_ASSET_USEFUL_LIFE_YEARS = 100;

export function fixedAssetToDraft(asset: FixedAsset): FixedAssetDraft {
  return {
    name: asset.name,
    account: asset.accountName,
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost.toLocaleString("ja-JP"),
    usefulLife: asset.usefulLife,
    businessRatePercent: asset.businessRate * 100,
    businessRate: asset.businessRate,
    status: asset.status,
    disposalDate: asset.disposalDate,
    disposalPrice:
      asset.disposalPrice == null
        ? null
        : asset.disposalPrice.toLocaleString("ja-JP"),
  };
}

export function capFixedAssetPreviewDate(
  today: Date,
  fiscalPeriodEndDate: string | null,
): Date {
  const periodEnd =
    fiscalPeriodEndDate == null
      ? null
      : parseIsoLocalDate(fiscalPeriodEndDate);
  if (periodEnd == null || today.getTime() <= periodEnd.getTime()) return today;
  return periodEnd;
}

export function resolveFixedAssetDraftPreviewDate(
  periodAsOf: Date,
  status: FixedAssetDraft["status"],
  disposalDate: string | null,
  retirementAsOf: Date | null,
): Date {
  if (status === "完了") return retirementAsOf ?? periodAsOf;
  const requiresDisposal = status === "売却済" || status === "廃棄済";
  if (!requiresDisposal || disposalDate == null) return periodAsOf;
  return parseIsoLocalDate(disposalDate) ?? periodAsOf;
}

export function computeFixedAssetDraftPeriodDepreciation(input: {
  draft: FixedAssetDraft;
  periodStartDate: string;
  asOf: Date;
}): number {
  const periodStartDate = parseIsoLocalDate(input.periodStartDate);
  if (periodStartDate == null) return 0;
  return computePeriodDepreciation({
    acquisitionDate: input.draft.acquisitionDate,
    acquisitionCost: parseAmount(input.draft.acquisitionCost),
    usefulLife: input.draft.usefulLife,
    periodStartDate,
    asOf: input.asOf,
  });
}

export function validateFixedAssetDraft(input: {
  draft: FixedAssetDraft;
  periodStartDate: string;
  periodEndDate: string;
  currentBookValue: number;
}): string | null {
  const { draft, periodStartDate, periodEndDate } = input;
  if (draft.name.trim() === "" || draft.account.trim() === "") {
    return "名称と勘定科目を入力してください";
  }
  if (parseIsoLocalDate(draft.acquisitionDate) == null) {
    return "正しい取得日を入力してください";
  }
  if (
    parseIsoLocalDate(periodEndDate) != null &&
    draft.acquisitionDate > periodEndDate
  ) {
    return "取得日は会計期間の終了日以前にしてください";
  }
  const acquisitionCost = parseAmount(draft.acquisitionCost);
  if (!Number.isSafeInteger(acquisitionCost) || acquisitionCost <= 0) {
    return "取得価額は安全に計算できる正の整数で入力してください";
  }
  if (
    !Number.isSafeInteger(draft.usefulLife) ||
    draft.usefulLife < 1 ||
    draft.usefulLife > MAX_FIXED_ASSET_USEFUL_LIFE_YEARS
  ) {
    return `耐用年数は1〜${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS}年で入力してください`;
  }
  if (
    !Number.isFinite(draft.businessRatePercent) ||
    draft.businessRatePercent < 0 ||
    draft.businessRatePercent > 100
  ) {
    return "事業割合は0〜100%で入力してください";
  }
  const needsDisposal =
    draft.status === "売却済" || draft.status === "廃棄済";
  if (needsDisposal) {
    const disposalDate = draft.disposalDate;
    if (disposalDate == null || parseIsoLocalDate(disposalDate) == null) {
      return "正しい処分日を入力してください";
    }
    if (disposalDate < draft.acquisitionDate) {
      return "処分日は取得日以降にしてください";
    }
    if (
      (parseIsoLocalDate(periodStartDate) != null &&
        disposalDate < periodStartDate) ||
      (parseIsoLocalDate(periodEndDate) != null && disposalDate > periodEndDate)
    ) {
      return "処分日は会計期間内にしてください";
    }
  }
  if (draft.status === "売却済") {
    const disposalPriceText = draft.disposalPrice;
    if (disposalPriceText == null || disposalPriceText.trim() === "") {
      return "売却額は安全に計算できる0以上の整数で入力してください";
    }
    const disposalPrice = parseAmount(disposalPriceText);
    if (
      !Number.isSafeInteger(disposalPrice) ||
      disposalPrice < 0
    ) {
      return "売却額は安全に計算できる0以上の整数で入力してください";
    }
  }
  if (draft.status === "完了" && input.currentBookValue > 1) {
    return "期末時点で償却が完了していない固定資産は完了にできません";
  }
  return null;
}
