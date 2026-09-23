import { describe, expect, it } from "vitest";

import { buildEntryMasterAccountOptions } from "./account-options.js";
import type {
  MasterBookAccountApiRecord,
} from "@rubydogjp/openkk-client-ports";

describe("buildEntryMasterAccountOptions", () => {
  it("labels same-name accounts with their balance-sheet section", () => {
    const options = buildEntryMasterAccountOptions([
      account({ id: "allowance-current", balanceSheetSection: "current_asset" }),
      account({ id: "allowance-fixed", balanceSheetSection: "fixed_asset" }),
    ]);

    expect(options.map((option) => option.selectionLabel)).toEqual([
      "貸倒引当金（流動資産）",
      "貸倒引当金（固定資産）",
    ]);
  });

  it("does not add redundant section text to a unique account", () => {
    const [option] = buildEntryMasterAccountOptions([
      account({ id: "cash", name: "現金", balanceSheetSection: "current_asset" }),
    ]);

    expect(option?.selectionLabel).toBe("現金");
  });

  it("falls back to ids when duplicate names have no distinct section", () => {
    const options = buildEntryMasterAccountOptions([
      account({
        id: "fee-primary",
        name: "手数料",
        accountType: "expense",
        balanceSheetSection: "none",
      }),
      account({
        id: "fee-secondary",
        name: "手数料",
        accountType: "expense",
        balanceSheetSection: "none",
      }),
    ]);

    expect(options.map((option) => option.selectionLabel)).toEqual([
      "手数料（fee-primary）",
      "手数料（fee-secondary）",
    ]);
  });
});

function account(
  overrides: Partial<MasterBookAccountApiRecord>,
): MasterBookAccountApiRecord {
  const base: MasterBookAccountApiRecord = {
    id: "allowance",
    name: "貸倒引当金",
    description: "",
    kana: "",
    normalBalanceSide: "credit",
    accountType: "asset",
    balanceSheetSection: "current_asset",
    sortOrder: 1,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
  return Object.assign(base, overrides);
}
