import { describe, expect, it } from "vitest";
import { resolveBookAccountId, type BookAccount } from "./book-account.js";

const accounts: BookAccount[] = [
  { id: "asset_bonus", name: "賞与", accountType: "asset" },
  { id: "expense_bonus", name: "賞与", accountType: "expense" },
  { id: "deferred_current", name: "繰延税金資産", accountType: "asset" },
  { id: "deferred_fixed", name: "繰延税金資産", accountType: "asset" },
];

describe("resolveBookAccountId", () => {
  it("preserves an explicit identity despite conflicting display fields", () => {
    expect(
      resolveBookAccountId({
        explicitId: "asset_bonus",
        accountName: "繰延税金資産",
        accountType: "expense",
        accounts,
      }),
    ).toBe("asset_bonus");
  });

  it("does not replace an unknown identity with another same-name account", () => {
    expect(
      resolveBookAccountId({
        explicitId: "unknown",
        accountName: "賞与",
        accountType: "expense",
        accounts,
      }),
    ).toBeNull();
  });

  it("resolves names by type and rejects remaining ambiguity", () => {
    expect(
      resolveBookAccountId({
        explicitId: null,
        accountName: "賞与",
        accountType: "expense",
        accounts,
      }),
    ).toBe("expense_bonus");
    expect(
      resolveBookAccountId({
        explicitId: null,
        accountName: "賞与",
        accountType: null,
        accounts,
      }),
    ).toBeNull();
    expect(
      resolveBookAccountId({
        explicitId: null,
        accountName: "繰延税金資産",
        accountType: "asset",
        accounts,
      }),
    ).toBeNull();
    expect(
      resolveBookAccountId({
        explicitId: "deferred_fixed",
        accountName: "繰延税金資産",
        accountType: "asset",
        accounts,
      }),
    ).toBe("deferred_fixed");
  });

  it("returns null for a missing or unmatched name", () => {
    for (const accountName of ["", "未登録科目"]) {
      expect(
        resolveBookAccountId({
          explicitId: null,
          accountName,
          accountType: null,
          accounts,
        }),
      ).toBeNull();
    }
  });
});
