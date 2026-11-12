import { describe, expect, it } from "vitest";

import * as driverDomain from "../packages/driver/src/domain/index.js";
import * as engineDomain from "../packages/engine/src/domain/index.js";

const SHARED_LIMITS = [
  "MAX_ENTRY_LINES",
  "MAX_ENTRY_IMPORT_ITEMS",
  "MAX_ENTRY_IMPORT_LINES",
  "MAX_TEXT_FIELD_LENGTH",
  "MAX_FISCAL_PERIOD_ARCHIVE_BYTES",
  "MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES",
] as const;

describe("shared driver/engine limits", () => {
  it.each(SHARED_LIMITS)("keeps %s identical on both sides", (name) => {
    const driverLimit = (driverDomain as Record<string, unknown>)[name];
    const engineLimit = (engineDomain as Record<string, unknown>)[name];
    expect(typeof driverLimit).toBe("number");
    expect(driverLimit).toBe(engineLimit);
  });
});
