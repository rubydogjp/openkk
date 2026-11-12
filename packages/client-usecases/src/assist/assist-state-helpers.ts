import {
  fixedAssetStatusRequiresDisposal,
  parseAmount,
  resolveBookAccountId,
  type BookAccount,
  type FixedAssetDraft,
  type FixedAsset,
  type OpeningCarryoverDraft,
} from "@rubydogjp/openkk-client-domain";
import type {
  EntryLineApiRecord,
  FixedAssetPatchInput,
} from "@rubydogjp/openkk-client-ports";

import {
  entryLinesToInputs,
  type EntryLineMaster,
  type UnresolvedAccountMessages,
} from "@rubydogjp/openkk-client-domain";

export function upsertFixedAsset(
  current: FixedAsset[],
  next: FixedAsset,
): FixedAsset[] {
  return [...current.filter((asset) => asset.id !== next.id), next];
}

export function listFixedAssetsForPeriod(
  assets: FixedAsset[],
  fiscalPeriodId: string,
): FixedAsset[] {
  return assets.filter((asset) => asset.fiscalPeriodId === fiscalPeriodId);
}

export function nextOpeningCarryoverId(
  fiscalPeriodId: string,
  journals: ReadonlyArray<{ id: string }>,
): string {
  const prefix = `oc-${fiscalPeriodId}-`;
  const usedSuffixes = new Set<number>();
  const maxSuffix = journals.reduce((max, journal) => {
    if (!journal.id.startsWith(prefix)) return max;
    const suffix = Number(journal.id.slice(prefix.length));
    if (!Number.isSafeInteger(suffix) || suffix < 1) return max;
    usedSuffixes.add(suffix);
    return suffix > max ? suffix : max;
  }, 0);
  if (maxSuffix < Number.MAX_SAFE_INTEGER) {
    return `${prefix}${maxSuffix + 1}`;
  }
  let availableSuffix = 1;
  while (usedSuffixes.has(availableSuffix)) availableSuffix += 1;
  return `${prefix}${availableSuffix}`;
}

export function buildOpeningJournalLines(
  journalId: string,
  draft: OpeningCarryoverDraft,
  master: EntryLineMaster,
  unresolvedAccount: UnresolvedAccountMessages,
): EntryLineApiRecord[] {
  for (const line of draft.lines) {
    if (line.id != null && line.id.trim() === "") {
      throw new Error("opening carryover line id must not be blank");
    }
  }
  const usedLineIds = new Set(
    draft.lines.flatMap((line) => (line.id == null ? [] : [line.id])),
  );
  const nextLineSequence = { debit: 1, credit: 1 };
  const allocateLineId = (side: "debit" | "credit") => {
    let id: string;
    do {
      const sequence = nextLineSequence[side]++;
      const suffix = `${side === "debit" ? "d" : "c"}${
        sequence === 1 ? "" : sequence
      }`;
      id = `${journalId}-${suffix}`;
    } while (usedLineIds.has(id));
    usedLineIds.add(id);
    return id;
  };
  const inputs = entryLinesToInputs(draft.lines, master, unresolvedAccount);
  return inputs.map((input, index) => ({
    id: draft.lines[index]!.id ?? allocateLineId(input.side),
    ...input,
  }));
}

export function resolveFixedAssetAccountId(
  current: { accountId: string | null; accountName: string | null } | null,
  draftAccountName: string,
  accounts: ReadonlyArray<BookAccount>,
): string | null {
  const unchangedAccountId =
    current?.accountName === draftAccountName ? current.accountId : null;
  const id = resolveBookAccountId({
    explicitId: unchangedAccountId,
    accountName: draftAccountName,
    accountType: "asset",
    accounts,
  });
  return accounts.find((account) => account.id === id)?.accountType === "asset"
    ? id
    : null;
}

export function fixedAssetDraftToPatch(
  draft: FixedAssetDraft,
  bookAccountId: string,
): FixedAssetPatchInput {
  return {
    name: draft.name,
    acquisitionDate: draft.acquisitionDate,
    acquisitionCost: parseAmount(draft.acquisitionCost),
    usefulLife: Math.max(1, Math.round(draft.usefulLife) || 1),
    businessRate: fixedAssetDraftBusinessRate(draft),
    status: draft.status,
    disposalDate: fixedAssetStatusRequiresDisposal(draft.status)
      ? requireDraftValue(draft.disposalDate, "disposalDate")
      : null,
    disposalPrice:
      draft.status === "sold"
        ? parseAmount(requireDraftValue(draft.disposalPrice, "disposalPrice"))
        : null,
    bookAccountId,
  };
}

function requireDraftValue(value: string | null, field: string): string {
  if (value == null) throw new Error(`fixed asset draft ${field} is required`);
  return value;
}

export function fixedAssetDraftBusinessRate(draft: FixedAssetDraft): number {
  return (
    draft.businessRate ??
    Math.max(0, Math.min(100, draft.businessRatePercent)) / 100
  );
}
