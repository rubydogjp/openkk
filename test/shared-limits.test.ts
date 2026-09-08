import { describe, expect, it } from "vitest";

import * as clientDomain from "../packages/client-domain/src/index.js";
import * as serverDomain from "../packages/server-domain/src/index.js";

const SHARED_LIMITS = [
  "MAX_ENTRY_LINES",
  "MAX_ENTRY_IMPORT_ITEMS",
  "MAX_ENTRY_IMPORT_LINES",
  "MAX_TEXT_FIELD_LENGTH",
] as const;

describe("shared client/server limits", () => {
  it.each(SHARED_LIMITS)("keeps %s identical on both sides", (name) => {
    const client = (clientDomain as Record<string, unknown>)[name];
    const server = (serverDomain as Record<string, unknown>)[name];
    expect(typeof client).toBe("number");
    expect(client).toBe(server);
  });
});
