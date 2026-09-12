import { describe, expect, it } from "vitest";
import { resolveCategoryId } from "./category-resolution.js";

const categories = [
  { id: "tax_10", name: "課税 10%" },
  { id: "tax_8", name: "軽減税率 8%" },
  { id: "tax_out_of_scope", name: "対象外" },
];

describe("resolveCategoryId", () => {
  it.each(["", "課税 10%"])(
    "preserves an unknown explicit id with display name %j",
    (name) => {
      expect(
        resolveCategoryId("custom_tax", name, categories, "tax_out_of_scope"),
      ).toBe("custom_tax");
    },
  );

  it("prioritizes ids over a conflicting display name", () => {
    expect(
      resolveCategoryId("tax_8", "課税 10%", categories, "tax_out_of_scope"),
    ).toBe("tax_8");
    expect(
      resolveCategoryId(
        "tax_8",
        "",
        [{ id: "other", name: "tax_8" }, ...categories],
        "tax_out_of_scope",
      ),
    ).toBe("tax_8");
  });

  it.each([
    [null, "課税 10%", "tax_10"],
    [" ", " 軽減税率 8% ", "tax_8"],
    [" 課税 10% ", "", "tax_10"],
    [null, "tax_8", "tax_8"],
    [null, "未知の区分", "未知の区分"],
    [null, " ", "tax_out_of_scope"],
  ])("resolves %j / %j to %j", (id, name, expected) => {
    expect(resolveCategoryId(id, name, categories, "tax_out_of_scope")).toBe(
      expected,
    );
  });
});
