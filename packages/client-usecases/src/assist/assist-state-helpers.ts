import {
  computeStraightLineDepreciation,
  parseAmount,
  parseIsoLocalDate,
  resolveCategoryId,
  resolveBookAccountId,
  type BookAccount,
  type BookAccountType,
  type FixedAssetDraft,
  type FixedAsset,
  type FixedAssetStatus,
  type OpeningCarryoverDraft,
  type OpeningCarryoverRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  FixedAssetApiRecord,
  FixedAssetPatchInput,
  OpeningJournalApiRecord,
  OpeningJournalLineApiRecord,
} from "@rubydogjp/openkk-client-ports";

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

export function mapOpeningJournalToRecord(
  journal: OpeningJournalApiRecord,
  fiscalPeriodId: string,
  accountNameById: Record<string, string>,
  accountTypeById: Record<string, BookAccountType>,
  taxCategoryNameById: Record<string, string>,
  businessCategoryNameById: Record<string, string>,
): OpeningCarryoverRecord {
  const lines = journal.lines.map((line) => ({
    id: line.id,
    side: line.side,
    accountName: accountNameById[line.bookAccountId] ?? line.bookAccountId,
    accountType: accountTypeById[line.bookAccountId] ?? "asset",
    amount: formatAmount(line.amount),
    bookAccountId: line.bookAccountId,
    partnerName: line.partnerName,
    taxCategoryId: line.taxCategoryId,
    taxCategoryName:
      taxCategoryNameById[line.taxCategoryId] ?? line.taxCategoryId,
    businessCategoryId: line.businessCategoryId,
    businessCategoryName:
      businessCategoryNameById[line.businessCategoryId] ??
      line.businessCategoryId,
  }));
  return {
    id: journal.id,
    fiscalPeriodId,
    date: journal.date,
    description: journal.description,
    businessRate: journal.businessRate,
    lines,
  };
}

export function buildOpeningJournalLines(
  journalId: string,
  draft: OpeningCarryoverDraft,
  master: {
    accounts: ReadonlyArray<BookAccount>;
    taxCategories: ReadonlyArray<{ id: string; name: string }>;
    businessCategories: ReadonlyArray<{ id: string; name: string }>;
  },
): OpeningJournalLineApiRecord[] | null {
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
  const result = [];
  for (const line of draft.lines) {
    const bookAccountId = resolveBookAccountId({
      explicitId: line.bookAccountId,
      accountName: line.accountName,
      accountType: line.accountType,
      accounts: master.accounts,
    });
    if (bookAccountId == null) return null;
    result.push({
      id: line.id ?? allocateLineId(line.side),
      side: line.side,
      bookAccountId,
      amount: parseAmount(line.amount),
      partnerName: line.partnerName ?? "",
      taxCategoryId: resolveCategoryId(
        line.taxCategoryId,
        line.taxCategoryName ?? "",
        master.taxCategories,
        "tax_out_of_scope",
      ),
      businessCategoryId: resolveCategoryId(
        line.businessCategoryId,
        line.businessCategoryName ?? "",
        master.businessCategories,
        "biz_none",
      ),
    });
  }
  return result;
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

export function mapFixedAsset(
  asset: FixedAssetApiRecord,
  accountName: string | null,
  today: Date,
  fiscalPeriodEndDate: string | null,
): FixedAsset {
  const isClosed = asset.status !== "active";
  const asOf =
    asset.status === "retired" && fiscalPeriodEndDate != null
      ? (parseIsoLocalDate(fiscalPeriodEndDate) ?? today)
      : isClosed && asset.disposalDate != null
        ? (parseIsoLocalDate(asset.disposalDate) ?? today)
        : today;
  const depreciation = computeStraightLineDepreciation({
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost,
    usefulLife: asset.usefulLife,
    asOf,
  });
  return {
    id: asset.id,
    fiscalPeriodId: asset.fiscalPeriodId,
    name: asset.name,
    accountName: accountName ?? asset.bookAccountId,
    bookAccountId: asset.bookAccountId,
    status: mapFixedAssetStatusLabel(asset.status),
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost,
    usefulLife: asset.usefulLife,
    businessRate: asset.businessRate,
    disposalDate: asset.disposalDate,
    disposalPrice: asset.disposalPrice,
    depreciationStartLabel: depreciation.periodLabel,
    remainingDepreciationLabel: depreciation.remainingLabel,
    depreciationProgress: depreciation.progress,
    currentBookValue: depreciation.currentBookValue,
  };
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
    status: mapFixedAssetStatusApi(draft.status),
    disposalDate: requiresFixedAssetDisposal(draft.status)
      ? requireDraftValue(draft.disposalDate, "disposalDate")
      : null,
    disposalPrice:
      draft.status === "売却済"
        ? parseAmount(requireDraftValue(draft.disposalPrice, "disposalPrice"))
        : null,
    bookAccountId,
  };
}

function requireDraftValue(value: string | null, field: string): string {
  if (value == null) throw new Error(`fixed asset draft ${field} is required`);
  return value;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.abs(value));
}

function mapFixedAssetStatusLabel(
  status: FixedAssetApiRecord["status"],
): FixedAssetStatus {
  const labels: Record<FixedAssetApiRecord["status"], FixedAssetStatus> = {
    active: "償却中",
    sold: "売却済",
    disposed: "廃棄済",
    retired: "完了",
  };
  return labels[status];
}

function mapFixedAssetStatusApi(
  statusLabel: FixedAssetStatus,
): "active" | "sold" | "disposed" | "retired" {
  const statuses: Record<
    FixedAssetStatus,
    "active" | "sold" | "disposed" | "retired"
  > = {
    償却中: "active",
    完了: "retired",
    売却済: "sold",
    廃棄済: "disposed",
  };
  return statuses[statusLabel];
}

export function fixedAssetDraftBusinessRate(draft: FixedAssetDraft): number {
  return (
    draft.businessRate ??
    Math.max(0, Math.min(100, draft.businessRatePercent)) / 100
  );
}

function requiresFixedAssetDisposal(statusLabel: string): boolean {
  return statusLabel === "売却済" || statusLabel === "廃棄済";
}
