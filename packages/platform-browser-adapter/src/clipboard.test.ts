import { afterEach, describe, expect, it, vi } from "vitest";

import { browserClipboard } from "./clipboard.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browserClipboard", () => {
  it("writes text through the async Clipboard API", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await browserClipboard.writeText("secret");

    expect(writeText).toHaveBeenCalledWith("secret");
  });

  it("rejects when the Clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    await expect(browserClipboard.writeText("secret")).rejects.toThrow(
      "Clipboard API is not available",
    );
  });
});
