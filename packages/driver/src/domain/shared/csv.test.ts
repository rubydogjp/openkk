import { describe, expect, it } from "vitest";

import {
  protectSpreadsheetFormula,
  unprotectSpreadsheetFormula,
} from "./csv.js";

describe("spreadsheet formula guard", () => {
  it.each([
    "=SUM(A1)",
    "+1",
    "-割引",
    "@cell",
    "＝全角",
    "＋全角",
    "－全角",
    "＠全角",
    "'=already quoted",
    "''-two quotes",
    "'plain quote",
    "普通の摘要",
    "",
  ])(
    "writes %j so a spreadsheet does not run it and reads it back unchanged",
    (value) => {
      const written = protectSpreadsheetFormula(value);
      expect(/^[=+\-@＝＋－＠]/.test(written)).toBe(false);
      expect(unprotectSpreadsheetFormula(written)).toBe(value);
    },
  );
});
