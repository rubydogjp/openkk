import type { EntryAccountVisualType } from "@rubydogjp/openkk-client-domain";

import { palette } from "../shared/design-tokens.js";

export type EntryAccountPalette = {
  background: string;
  foreground: string;
};

export function entryAccountPalette(
  type: EntryAccountVisualType,
): EntryAccountPalette {
  switch (type) {
    case "asset":
      return {
        background: palette.accountAssetBg,
        foreground: palette.accountAsset,
      };
    case "liability":
      return {
        background: palette.accountLiabilityBg,
        foreground: palette.accountLiability,
      };
    case "equity":
      return {
        background: palette.accountEquityBg,
        foreground: palette.accountEquity,
      };
    case "revenue":
      return {
        background: palette.accountRevenueBg,
        foreground: palette.accountRevenue,
      };
    case "cost_of_sales":
    case "expense":
      return {
        background: palette.accountExpenseBg,
        foreground: palette.accountExpense,
      };
  }
}

export function EntryAccountIcon(props: {
  type: EntryAccountVisualType;
  color: string;
  size: number;
}) {
  const iconPath = entryAccountIconPath(props.type);
  return (
    <span
      aria-hidden="true"
      style={{
        width: props.size,
        height: props.size,
        display: "block",
        flexShrink: 0,
        backgroundColor: props.color,
        maskImage: `url('${iconPath}')`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url('${iconPath}')`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function entryAccountIconPath(type: EntryAccountVisualType): string {
  switch (type) {
    case "asset":
      return "/icons/assets.svg";
    case "liability":
      return "/icons/liabilities.svg";
    case "equity":
      return "/icons/net-assets.svg";
    case "revenue":
      return "/icons/revenue.svg";
    case "cost_of_sales":
    case "expense":
      return "/icons/expense.svg";
  }
}
