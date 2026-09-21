import { expect, it } from "vitest";
import {
  assertFiscalPeriodArchiveSize,
  MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES,
} from "./archive-limits.js";

it("limits individual archive files and their combined UTF-8 size", () => {
  const fullFile = "a".repeat(MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES - 2);
  expect(() => assertFiscalPeriodArchiveSize([fullFile, fullFile])).not.toThrow();
  expect(() => assertFiscalPeriodArchiveSize([`${fullFile}a`])).toThrow(/size limit/);
  expect(() => assertFiscalPeriodArchiveSize([fullFile, fullFile, "a"])).toThrow(/size limit/);
  expect(() => assertFiscalPeriodArchiveSize(["資".repeat(Math.ceil(MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES / 3))])).toThrow(/size limit/);
});
