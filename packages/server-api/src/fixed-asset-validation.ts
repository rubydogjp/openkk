import {
  applyPatch,
  assertFixedAssetMatchesRules,
  FIXED_ASSET_PATCH_KEYS,
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
    applyPatch(existing, patch, FIXED_ASSET_PATCH_KEYS),
    period,
  );
}
