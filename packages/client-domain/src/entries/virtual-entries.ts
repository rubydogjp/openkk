import type { FixedAssetPreviewItem } from "../assist/fixed-asset-data";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover";
import type { EntryAccountVisualType, EntryPreviewRow } from "./entries-types";
import { parseAmount } from "../shared/parse-utils";

export function buildVirtualOpeningCarryoverRows(input: {
  fiscalPeriodId: string;
  records: OpeningCarryoverRecord[];
  yearMonth: string;
}): EntryPreviewRow[] {
  return input.records
    .filter(
      (record) =>
        record.fiscalPeriodId === input.fiscalPeriodId &&
        record.date.startsWith(input.yearMonth),
    )
    .map((record) => ({
      recordId: `virtual-opening-carryover-${record.id}`,
      lineIndex: 0,
      lineCount: 1,
      isFirstOfRecord: true,
      date: `${record.date.slice(5, 7)}/${record.date.slice(8, 10)}`,
      weekday: "",
      debit: record.debit,
      debitType: record.debitType,
      debitAmount: record.debitAmount,
      credit: record.credit,
      creditType: record.creditType,
      creditAmount: record.creditAmount,
      description: record.description,
      partner: record.partner,
      businessRate: record.businessRate,
      taxCategory: record.taxCategory,
      businessCategory: record.businessCategory,
      virtual: {
        id: `opening-carryover-${record.id}`,
        kind: "opening_carryover",
        sourceId: record.id,
        label: "再振替",
        assistHref: `/assist/opening-carryover?carryover=${record.id}`,
      },
    }));
}

export function buildVirtualFixedAssetRows(input: {
  fiscalPeriodId: string;
  assets: FixedAssetPreviewItem[];
  periodEndDate: string | null;
  yearMonth: string;
}): EntryPreviewRow[] {
  const periodEndDate = input.periodEndDate;
  const depreciationRows =
    periodEndDate == null || !periodEndDate.startsWith(input.yearMonth)
      ? []
      : input.assets
          .filter(
            (asset) =>
              (asset.fiscalPeriodId == null ||
                asset.fiscalPeriodId === input.fiscalPeriodId) &&
              asset.status === "償却中",
          )
          .map((asset) => {
            const purchase = parseAmount(asset.purchase);
            const current = parseAmount(asset.current);
            const depreciation = asset.depreciationAmount
              ? parseAmount(asset.depreciationAmount)
              : Math.max(0, purchase - current);
            const amount = formatAmount(depreciation);
            return {
              recordId: `virtual-fixed-asset-${asset.id}`,
              lineIndex: 0,
              lineCount: 1,
              isFirstOfRecord: true,
              date: `${periodEndDate.slice(5, 7)}/${periodEndDate.slice(8, 10)}`,
              weekday: "",
              debit: "減価償却費",
              debitType: "expense" as EntryAccountVisualType,
              debitAmount: amount,
              credit: asset.account,
              creditType: "asset" as EntryAccountVisualType,
              creditAmount: amount,
              description: `${asset.name}の減価償却`,
              partner: "",
              businessRate:
                asset.businessRate == null
                  ? ""
                  : String(Math.round(asset.businessRate * 100)),
              taxCategory: "対象外",
              businessCategory: "",
              virtual: {
                id: `fixed-asset-${asset.id}`,
                kind: "fixed_asset" as const,
                sourceId: asset.id,
                label: "固定資産",
                assistHref: `/assist/fixed-assets?asset=${asset.id}`,
              },
            };
          });
  const saleRows = input.assets
    .filter(
      (asset) =>
        (asset.fiscalPeriodId == null ||
          asset.fiscalPeriodId === input.fiscalPeriodId) &&
        asset.status === "売却済" &&
        asset.disposalDate != null &&
        asset.disposalDate.startsWith(input.yearMonth),
    )
    .flatMap((asset) => {
      const disposalPrice = parseAmount(asset.disposalPrice ?? "0");
      const bookValue = parseAmount(asset.current);
      const gain = Math.max(0, disposalPrice - bookValue);
      const loss = Math.max(0, bookValue - disposalPrice);
      const debits: Array<{
        accountName: string;
        accountType: EntryAccountVisualType;
        amount: number;
      }> = [];
      const credits: Array<{
        accountName: string;
        accountType: EntryAccountVisualType;
        amount: number;
      }> = [];
      if (disposalPrice > 0) {
        debits.push({
          accountName: "普通預金",
          accountType: "asset",
          amount: disposalPrice,
        });
      }
      if (loss > 0) {
        debits.push({
          accountName: "固定資産売却損",
          accountType: "expense",
          amount: loss,
        });
      }
      if (bookValue > 0) {
        credits.push({
          accountName: asset.account,
          accountType: "asset",
          amount: bookValue,
        });
      }
      if (gain > 0) {
        credits.push({
          accountName: "固定資産売却益",
          accountType: "revenue",
          amount: gain,
        });
      }
      return buildVirtualRowsFromPairs({
        recordId: `virtual-fixed-asset-sale-${asset.id}`,
        date: `${asset.disposalDate!.slice(5, 7)}/${asset.disposalDate!.slice(8, 10)}`,
        description: `${asset.name}の売却`,
        businessRate:
          asset.businessRate == null ? "" : String(Math.round(asset.businessRate * 100)),
        virtual: {
          id: `fixed-asset-${asset.id}`,
          kind: "fixed_asset" as const,
          sourceId: asset.id,
          label: "固定資産",
          assistHref: `/assist/fixed-assets?asset=${asset.id}`,
        },
        debits,
        credits,
      });
    });
  return [...depreciationRows, ...saleRows];
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function buildVirtualRowsFromPairs(input: {
  recordId: string;
  date: string;
  description: string;
  businessRate: string;
  virtual: EntryPreviewRow["virtual"];
  debits: Array<{
    accountName: string;
    accountType: EntryAccountVisualType;
    amount: number;
  }>;
  credits: Array<{
    accountName: string;
    accountType: EntryAccountVisualType;
    amount: number;
  }>;
}): EntryPreviewRow[] {
  const rowCount = Math.max(input.debits.length, input.credits.length);
  if (rowCount === 0) return [];
  return Array.from({ length: rowCount }, (_, index) => {
    const debit = input.debits[index] ?? null;
    const credit = input.credits[index] ?? null;
    return {
      recordId: input.recordId,
      lineIndex: index,
      lineCount: rowCount,
      isFirstOfRecord: index === 0,
      date: input.date,
      weekday: "",
      debit: debit?.accountName ?? "",
      debitType: debit?.accountType ?? "asset",
      debitAmount: debit == null ? "" : formatAmount(debit.amount),
      credit: credit?.accountName ?? "",
      creditType: credit?.accountType ?? "asset",
      creditAmount: credit == null ? "" : formatAmount(credit.amount),
      description: input.description,
      partner: "",
      businessRate: input.businessRate,
      taxCategory: "対象外",
      businessCategory: "",
      virtual: input.virtual,
    };
  });
}
