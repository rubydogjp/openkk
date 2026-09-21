import {
  assertFixedAssetMatchesRules,
} from "@rubydogjp/openkk-server-domain";
import type {
  FiscalPeriodApiRecord,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
} from "@rubydogjp/openkk-server-ports";
import {
  assertNonBlankText,
  assertObject,
  assertTextChange,
} from "./common-validation.js";

export function assertFixedAssetCreateInput(
  input: FixedAssetCreateInput,
  period: FiscalPeriodApiRecord,
): void {
  assertObject(input, "Fixed asset input");
  assertNonBlankText(input.name, "Fixed asset name");
  assertFixedAssetMatchesRules(
    { ...input, status: "active", disposalDate: null, disposalPrice: null },
    period,
  );
}

export function assertFixedAssetPatchInput(
  patch: FixedAssetPatchInput,
  existing: FixedAssetApiRecord,
): void {
  assertObject(patch, "Fixed asset patch");
  if (patch.name !== undefined) {
    assertTextChange(patch.name, existing.name, "Fixed asset name");
  }
}

export function assertPatchedFixedAsset(
  existing: FixedAssetApiRecord,
  patch: FixedAssetPatchInput,
  period: FiscalPeriodApiRecord,
): void {
  assertFixedAssetMatchesRules(
    {
      name: patch.name ?? existing.name,
      acquisitionDate: patch.acquisitionDate ?? existing.acquisitionDate,
      acquisitionCost: patch.acquisitionCost ?? existing.acquisitionCost,
      usefulLife: patch.usefulLife ?? existing.usefulLife,
      depreciationMethod:
        patch.depreciationMethod ?? existing.depreciationMethod,
      businessRate: patch.businessRate ?? existing.businessRate,
      status: patch.status ?? existing.status,
      disposalDate:
        patch.disposalDate === undefined
          ? existing.disposalDate
          : patch.disposalDate,
      disposalPrice:
        patch.disposalPrice === undefined
          ? existing.disposalPrice
          : patch.disposalPrice,
      bookAccountId: patch.bookAccountId ?? existing.bookAccountId,
    },
    period,
  );
}
