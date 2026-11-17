import {
  type FixedAsset,
  type FixedAssetDisposalProceedsTo,
  type FixedAssetDraft,
} from "./fixed-asset-data.js";
import {
  fixedAssetToDraft,
  validateFixedAssetDraft,
} from "./fixed-asset-draft.js";
import { buildFixedAssetDisposalEntries } from "../entries/virtual-entries.js";
import type { EntryRecord } from "../entries/entry-record.js";
import { parseAmount } from "../shared/parse-utils.js";

export type FixedAssetDisposalKind = "sold" | "disposed";

export type FixedAssetDisposalStep = "kind" | "when" | "where" | "confirm";

export type FixedAssetDisposalAnswers = {
  kind: FixedAssetDisposalKind | null;
  disposalDate: string;
  disposalPrice: string;
  disposalProceedsTo: FixedAssetDisposalProceedsTo | null;
};

export const EMPTY_FIXED_ASSET_DISPOSAL_ANSWERS: FixedAssetDisposalAnswers = {
  kind: null,
  disposalDate: "",
  disposalPrice: "",
  disposalProceedsTo: null,
};

export function fixedAssetDisposalSteps(
  kind: FixedAssetDisposalKind | null,
): FixedAssetDisposalStep[] {
  return kind === "disposed"
    ? ["kind", "when", "confirm"]
    : ["kind", "when", "where", "confirm"];
}

export function fixedAssetDisposalStepTitle(
  step: FixedAssetDisposalStep,
  kind: FixedAssetDisposalKind | null,
): string {
  switch (step) {
    case "kind":
      return "どうしましたか？";
    case "when":
      return kind === "disposed"
        ? "いつ捨てましたか？"
        : "いつ・いくらで売りましたか？";
    case "where":
      return "代金はどこに入りましたか？";
    case "confirm":
      return "本締めで入る仕訳";
  }
}

export function fixedAssetDisposalDraft(
  asset: FixedAsset,
  answers: FixedAssetDisposalAnswers,
): FixedAssetDraft {
  const sold = answers.kind === "sold";
  return {
    ...fixedAssetToDraft(asset),
    status: answers.kind ?? "sold",
    disposalDate: answers.disposalDate,
    disposalPrice: sold ? answers.disposalPrice : null,
    disposalProceedsTo: sold ? answers.disposalProceedsTo : null,
  };
}

export function validateFixedAssetDisposalWhen(input: {
  asset: FixedAsset;
  answers: FixedAssetDisposalAnswers;
  periodStartDate: string;
  periodEndDate: string;
}): string | null {
  if (input.answers.kind == null) return null;
  return validateFixedAssetDraft({
    draft: fixedAssetDisposalDraft(input.asset, input.answers),
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    currentBookValue: 0,
  });
}

export function fixedAssetDisposalPreviewEntries(input: {
  asset: FixedAsset;
  answers: FixedAssetDisposalAnswers;
  periodStartDate: string;
}): EntryRecord[] {
  const { answers } = input;
  if (answers.kind == null) return [];
  const sold = answers.kind === "sold";
  return buildFixedAssetDisposalEntries(
    {
      ...input.asset,
      status: answers.kind,
      disposalDate: answers.disposalDate,
      disposalPrice: sold ? parseAmount(answers.disposalPrice) : null,
      disposalProceedsTo: sold ? answers.disposalProceedsTo : null,
    },
    input.periodStartDate,
  );
}

export function revertFixedAssetDisposalDraft(
  draft: FixedAssetDraft,
): FixedAssetDraft {
  return {
    ...draft,
    status: "active",
    disposalDate: null,
    disposalPrice: null,
    disposalProceedsTo: null,
  };
}
