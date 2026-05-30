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
    .map((asset) => {
      const disposalPrice = parseAmount(asset.disposalPrice ?? "0");
      const amount = formatAmount(disposalPrice);
      return {
        recordId: `virtual-fixed-asset-sale-${asset.id}`,
        lineIndex: 0,
        lineCount: 1,
        isFirstOfRecord: true,
        date: `${asset.disposalDate!.slice(5, 7)}/${asset.disposalDate!.slice(8, 10)}`,
        weekday: "",
        debit: "普通預金",
        debitType: "asset" as EntryAccountVisualType,
        debitAmount: amount,
        credit: asset.account,
        creditType: "asset" as EntryAccountVisualType,
        creditAmount: amount,
        description: `${asset.name}の売却`,
        partner: "",
        businessRate:
          asset.businessRate == null ? "" : String(Math.round(asset.businessRate * 100)),
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
  return [...depreciationRows, ...saleRows];
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}
