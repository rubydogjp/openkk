import {
  assertFixedAssetMatchesRules,
  requireObject,
} from "@rubydogjp/openkk-server-domain";
import type {
  FiscalPeriodApiRecord,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
} from "@rubydogjp/openkk-server-ports";
import {
  assertNonBlankTextField,
  assertTextFieldChange,
} from "./common-validation.js";

export function assertFixedAssetCreateInput(
  input: unknown,
  period: FiscalPeriodApiRecord,
): asserts input is FixedAssetCreateInput {
  const value = requireObject(input, "Fixed asset input");
  assertNonBlankTextField(value.name, "Fixed asset name");
  assertFixedAssetMatchesRules(
    { ...value, status: "active", disposalDate: null, disposalPrice: null },
    period,
  );
}

export function assertFixedAssetPatchInput(
  patch: unknown,
  existing: FixedAssetApiRecord,
): asserts patch is FixedAssetPatchInput {
  const value = requireObject(patch, "Fixed asset patch");
  if (value.name !== undefined) {
    assertTextFieldChange(value.name, existing.name, "Fixed asset name");
  }
}

export function assertPatchedFixedAsset(
  existing: FixedAssetApiRecord,
  patch: FixedAssetPatchInput,
  period: FiscalPeriodApiRecord,
): void {
  assertFixedAssetMatchesRules(
    {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.acquisitionDate !== undefined
        ? { acquisitionDate: patch.acquisitionDate }
        : {}),
      ...(patch.acquisitionCost !== undefined
        ? { acquisitionCost: patch.acquisitionCost }
        : {}),
      ...(patch.usefulLife !== undefined
        ? { usefulLife: patch.usefulLife }
        : {}),
      ...(patch.depreciationMethod !== undefined
        ? { depreciationMethod: patch.depreciationMethod }
        : {}),
      ...(patch.businessRate !== undefined
        ? { businessRate: patch.businessRate }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.disposalDate !== undefined
        ? { disposalDate: patch.disposalDate }
        : {}),
      ...(patch.disposalPrice !== undefined
        ? { disposalPrice: patch.disposalPrice }
        : {}),
      ...(patch.bookAccountId !== undefined
        ? { bookAccountId: patch.bookAccountId }
        : {}),
    },
    period,
  );
}
