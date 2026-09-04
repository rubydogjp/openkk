import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBytes } from "./download.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadBytes", () => {
  it("removes temporary resources after a successful click", () => {
    const remove = vi.fn();
    const click = vi.fn();
    const revokeObjectURL = vi.fn();
    stubBrowserDownload({ click, remove, revokeObjectURL });

    downloadBytes(Uint8Array.of(1, 2, 3), "test.bin", "application/octet-stream");

    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("removes temporary resources even when the browser rejects the click", () => {
    const remove = vi.fn();
    const click = vi.fn(() => {
      throw new Error("download blocked");
    });
    const revokeObjectURL = vi.fn();
    stubBrowserDownload({ click, remove, revokeObjectURL });

    expect(() =>
      downloadBytes(
        Uint8Array.of(1, 2, 3),
        "test.bin",
        "application/octet-stream",
      ),
    ).toThrow("download blocked");
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});

function stubBrowserDownload(input: {
  click: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
}): void {
  const anchor = {
    href: "",
    download: "",
    click: input.click,
    remove: input.remove,
  };
  vi.stubGlobal("document", {
    body: { appendChild: vi.fn() },
    createElement: vi.fn(() => anchor),
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: input.revokeObjectURL,
  });
  vi.stubGlobal("window", {
    setTimeout: vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
  });
}
