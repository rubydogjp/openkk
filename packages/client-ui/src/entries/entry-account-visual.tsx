import type { BookAccountType } from "@rubydogjp/openkk-client-domain";

import { palette } from "../shared/design-tokens.js";
import { MaskIcon } from "../shared/icons.js";

export type EntryAccountPalette = {
  background: string;
  foreground: string;
};

export function entryAccountPalette(
  type: BookAccountType,
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
  type: BookAccountType;
  color: string;
  size: number;
}) {
  return (
    <MaskIcon
      src={entryAccountIconPath(props.type)}
      size={props.size}
      color={props.color}
    />
  );
}

function entryAccountIconPath(type: BookAccountType): string {
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
