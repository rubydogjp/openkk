import {
  computeStraightLineDepreciation,
  formatBusinessRatePercent,
  parseAmount,
  parseBusinessRate,
  parseIsoLocalDate,
  type EntryAccountVisualType,
  type FixedAssetDraft,
  type FixedAssetPreviewItem,
  type OpeningCarryoverDraft,
  type OpeningCarryoverRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  FixedAssetApiRecord,
  FixedAssetPatchInput,
} from "@rubydogjp/openkk-client-ports";

export function replaceLoadedFixedAssets(
  fiscalPeriodId: string | null,
  nextAssets: FixedAssetPreviewItem[],
): FixedAssetPreviewItem[] {
  if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return [];
  return nextAssets;
}

export function upsertFixedAsset(
  current: FixedAssetPreviewItem[],
  next: FixedAssetPreviewItem,
): FixedAssetPreviewItem[] {
  return [...current.filter((asset) => asset.id !== next.id), next];
}

export function listFixedAssetsForPeriod(
  assets: FixedAssetPreviewItem[],
  fiscalPeriodId?: string,
): FixedAssetPreviewItem[] {
  if (fiscalPeriodId == null) return assets;
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
  journal: {
    id: string;
    date: string;
    description: string;
    businessRate: number;
    lines: Array<{
      id: string;
      side: "debit" | "credit";
      bookAccountId: string;
      amount: number;
      partnerName: string;
      taxCategoryId: string;
      businessCategoryId: string;
    }>;
  },
  fiscalPeriodId: string,
  accountNameById: Record<string, string>,
  accountTypeById: Record<string, EntryAccountVisualType>,
  taxCategoryNameById: Record<string, string>,
  businessCategoryNameById: Record<string, string>,
): OpeningCarryoverRecord {
  const debit = journal.lines.find((line) => line.side === "debit");
  const credit = journal.lines.find((line) => line.side === "credit");
  const lines = journal.lines.map((line) => ({
    id: line.id,
    side: line.side,
    accountName:
      accountNameById[line.bookAccountId] ?? line.bookAccountId,
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
    debit:
      accountNameById[debit?.bookAccountId ?? ""] ?? debit?.bookAccountId ?? "",
    debitType: accountTypeById[debit?.bookAccountId ?? ""] ?? "asset",
    debitAmount: formatAmount(debit?.amount ?? 0),
    credit:
      accountNameById[credit?.bookAccountId ?? ""] ??
      credit?.bookAccountId ??
      "",
    creditType: accountTypeById[credit?.bookAccountId ?? ""] ?? "revenue",
    creditAmount: formatAmount(credit?.amount ?? 0),
    partner: debit?.partnerName ?? credit?.partnerName ?? "",
    taxCategory:
      taxCategoryNameById[debit?.taxCategoryId ?? ""] ??
      taxCategoryNameById[credit?.taxCategoryId ?? ""] ??
      debit?.taxCategoryId ??
      credit?.taxCategoryId ??
      "対象外",
    businessCategory:
      businessCategoryNameById[debit?.businessCategoryId ?? ""] ??
      businessCategoryNameById[credit?.businessCategoryId ?? ""] ??
      debit?.businessCategoryId ??
      credit?.businessCategoryId ??
      "対象外",
    businessRate: formatBusinessRatePercent(journal.businessRate ?? 1),
    businessRateRatio: journal.businessRate ?? 1,
    debitBookAccountId: debit?.bookAccountId,
    creditBookAccountId: credit?.bookAccountId,
    lines,
  };
}

export function buildOpeningJournalLines(
  journalId: string,
  draft: OpeningCarryoverDraft,
  master: {
    accountIdsByName: Record<string, string[]>;
    accountTypeById: Record<string, EntryAccountVisualType>;
    taxCategoryIdByValue: Record<string, string>;
    businessCategoryIdByValue: Record<string, string>;
  },
): Array<{
  id: string;
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
}> | null {
  const draftLines =
    draft.lines ??
    [
      {
        id: "",
        side: "debit" as const,
        accountName: draft.debit,
        accountType: draft.debitType,
        amount: draft.debitAmount,
        bookAccountId: draft.debitBookAccountId,
      },
      {
        id: "",
        side: "credit" as const,
        accountName: draft.credit,
        accountType: draft.creditType,
        amount: draft.creditAmount,
        bookAccountId: draft.creditBookAccountId,
      },
    ];
  const usedLineIds = new Set(
    draftLines.flatMap((line) =>
      typeof line.id === "string" && line.id.trim() !== "" ? [line.id] : [],
    ),
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
  for (const line of draftLines) {
    const bookAccountId = resolveBookAccountId(
      line.bookAccountId,
      line.accountName,
      line.accountType,
      master,
    );
    if (bookAccountId == null) return null;
    const existingLineId =
      typeof line.id === "string" && line.id.trim() !== "" ? line.id : null;
    result.push({
      id: existingLineId ?? allocateLineId(line.side),
      side: line.side,
      bookAccountId,
      amount: parseAmount(line.amount),
      partnerName: line.partnerName ?? draft.partner,
      taxCategoryId: resolveCategoryId(
        line.taxCategoryId ?? draft.taxCategory,
        master.taxCategoryIdByValue,
        "tax_out_of_scope",
      ),
      businessCategoryId: resolveCategoryId(
        line.businessCategoryId ?? draft.businessCategory,
        master.businessCategoryIdByValue,
        "biz_none",
      ),
    });
  }
  return result;
}

export function resolveBookAccountId(
  explicitId: string | undefined,
  name: string,
  accountType: EntryAccountVisualType,
  master: {
    accountIdsByName: Record<string, string[]>;
    accountTypeById: Record<string, EntryAccountVisualType>;
  },
): string | null {
  if (
    explicitId != null &&
    explicitId.length > 0 &&
    master.accountTypeById[explicitId] === accountType
  ) {
    return explicitId;
  }
  const matches = (master.accountIdsByName[name] ?? []).filter(
    (id) => master.accountTypeById[id] === accountType,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function resolveUpdatedBookAccountId(
  current: { accountId?: string; accountName?: string } | null,
  draftAccountName: string,
  accountType: EntryAccountVisualType,
  master: {
    accountIdsByName: Record<string, string[]>;
    accountTypeById: Record<string, EntryAccountVisualType>;
  },
): string | null {
  const unchangedAccountId =
    current?.accountName === draftAccountName ? current.accountId : undefined;
  return resolveBookAccountId(
    unchangedAccountId,
    draftAccountName,
    accountType,
    master,
  );
}

export function groupAccountIdsByName(
  accounts: ReadonlyArray<{ id: string; name: string }>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const account of accounts) {
    (result[account.name] ??= []).push(account.id);
  }
  return result;
}

export function buildCategoryIdByValue(
  categories: ReadonlyArray<{ id: string; name: string }>,
): Record<string, string> {
  return Object.fromEntries(
    categories.flatMap((category) => [
      [category.id, category.id],
      [category.name, category.id],
    ]),
  );
}

export function resolveCategoryId(
  value: string,
  categoryIdByValue: Record<string, string>,
  fallbackId: string,
): string {
  return categoryIdByValue[value] ?? (value.trim() === "" ? fallbackId : value);
}

export function mapFixedAssetToPreview(
  asset: FixedAssetApiRecord,
  accountName: string | undefined,
  today: Date,
  fiscalPeriodEndDate: string | undefined,
): FixedAssetPreviewItem {
  const isClosed = asset.status !== "active";
  const asOf =
    asset.status === "retired"
      ? (parseIsoLocalDate(fiscalPeriodEndDate ?? "") ?? today)
      : isClosed && asset.disposalDate
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
    account: accountName ?? asset.bookAccountId,
    accountId: asset.bookAccountId,
    period: depreciation.periodLabel,
    remaining: depreciation.remainingLabel,
    progress: depreciation.progress,
    current: formatYen(depreciation.currentBookValue),
    purchase: formatYen(asset.acquisitionCost),
    status: mapFixedAssetStatusLabel(asset.status),
    depreciationAmount: formatYen(depreciation.annualDepreciation),
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost,
    usefulLife: asset.usefulLife,
    businessRate: asset.businessRate,
    disposalDate: asset.disposalDate || undefined,
    disposalPrice: asset.disposalPrice
      ? formatYen(asset.disposalPrice)
      : undefined,
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
    businessRate: resolveFixedAssetDraftBusinessRate(draft),
    status: mapFixedAssetStatusApi(draft.status),
    disposalDate: requiresFixedAssetDisposal(draft.status)
      ? (draft.disposalDate ?? "")
      : "",
    disposalPrice:
      draft.status === "売却済" ? parseAmount(draft.disposalPrice ?? "0") : 0,
    bookAccountId,
  };
}

export function openingDraftBusinessRate(draft: OpeningCarryoverDraft): number {
  const exact = draft.businessRateRatio;
  if (exact != null && Number.isFinite(exact) && exact >= 0 && exact <= 1) {
    return exact;
  }
  return parseBusinessRate(draft.businessRate);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.abs(value));
}

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function mapFixedAssetStatusLabel(status: string): string {
  if (status === "active") return "償却中";
  if (status === "sold") return "売却済";
  if (status === "disposed") return "廃棄済";
  if (status === "retired") return "完了";
  return status;
}

function mapFixedAssetStatusApi(
  statusLabel: string,
): "active" | "sold" | "disposed" | "retired" {
  if (statusLabel === "償却中") return "active";
  if (statusLabel === "売却済") return "sold";
  if (statusLabel === "廃棄済") return "disposed";
  if (statusLabel === "完了") return "retired";
  return "active";
}

export function resolveFixedAssetDraftBusinessRate(
  draft: FixedAssetDraft,
): number {
  const exact = draft.businessRateRatio;
  if (exact != null && Number.isFinite(exact) && exact >= 0 && exact <= 1) {
    return exact;
  }
  return Math.max(0, Math.min(100, draft.businessRatePercent)) / 100;
}

function requiresFixedAssetDisposal(statusLabel: string): boolean {
  return statusLabel === "売却済" || statusLabel === "廃棄済";
}
