import { describe, expect, it, vi } from "vitest";

import { openExternalUrl } from "./external-navigation.js";

describe("openExternalUrl", () => {
  it("opens a new context without an opener or referrer", () => {
    const opener = vi.fn();

    openExternalUrl("https://example.com/", opener);

    expect(opener).toHaveBeenCalledWith(
      "https://example.com/",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
