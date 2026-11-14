import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deliverBookFile } from "./book-file-delivery.js";
import { browserFiles } from "./files.js";

vi.mock("./files.js", () => ({ browserFiles: { save: vi.fn() } }));

const BOOK_BYTES = Uint8Array.of(1, 2, 3);
const BOOK_NAME = "2026年分.openkk";

type PickerOptions = {
  id: string;
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
};

function writerThat(write: (bytes: Uint8Array) => Promise<void>) {
  return {
    write: vi.fn(write),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  };
}

function stubBrowser(input: {
  showSaveFilePicker: ((options: PickerOptions) => Promise<unknown>) | null;
  pointerIsCoarse: boolean;
  share: ((data: { files: File[] }) => Promise<void>) | null;
}) {
  vi.stubGlobal("window", {
    showSaveFilePicker: input.showSaveFilePicker,
    matchMedia: () => ({ matches: input.pointerIsCoarse }),
  });
  vi.stubGlobal("navigator", {
    canShare: () => input.share != null,
    share: input.share,
  });
}

beforeEach(() => {
  vi.mocked(browserFiles.save).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deliverBookFile", () => {
  it("writes the book into the file the user picked and reports it saved", async () => {
    const written: Uint8Array[] = [];
    const writer = writerThat(async (bytes) => {
      written.push(bytes);
    });
    const showSaveFilePicker = vi.fn(async (_options: PickerOptions) => ({
      createWritable: async () => writer,
    }));
    stubBrowser({ showSaveFilePicker, pointerIsCoarse: false, share: null });

    const result = await deliverBookFile(BOOK_BYTES, BOOK_NAME);

    expect(result).toBe("saved");
    expect(written).toEqual([BOOK_BYTES]);
    expect(writer.close).toHaveBeenCalledOnce();
    expect(showSaveFilePicker.mock.calls[0]?.[0]).toMatchObject({
      id: "openkk-book",
      suggestedName: BOOK_NAME,
      types: [{ accept: { "application/x-openkk": [".openkk"] } }],
    });
    expect(browserFiles.save).not.toHaveBeenCalled();
  });

  it("reports a cancelled save when the user closes the picker", async () => {
    stubBrowser({
      showSaveFilePicker: async () => {
        throw new DOMException("closed", "AbortError");
      },
      pointerIsCoarse: false,
      share: null,
    });

    const result = await deliverBookFile(BOOK_BYTES, BOOK_NAME);

    expect(result).toBe("cancelled");
    expect(browserFiles.save).not.toHaveBeenCalled();
  });

  it("fails without reporting a save when the picked file cannot be written", async () => {
    const writer = writerThat(async () => {
      throw new Error("disk full");
    });
    stubBrowser({
      showSaveFilePicker: async () => ({ createWritable: async () => writer }),
      pointerIsCoarse: false,
      share: null,
    });

    await expect(deliverBookFile(BOOK_BYTES, BOOK_NAME)).rejects.toThrow(
      "disk full",
    );

    expect(writer.abort).toHaveBeenCalledOnce();
    expect(writer.close).not.toHaveBeenCalled();
    expect(browserFiles.save).not.toHaveBeenCalled();
  });

  it("downloads the book in a browser without a save picker", async () => {
    stubBrowser({
      showSaveFilePicker: null,
      pointerIsCoarse: false,
      share: null,
    });

    const result = await deliverBookFile(BOOK_BYTES, BOOK_NAME);

    expect(result).toBe("saved");
    expect(browserFiles.save).toHaveBeenCalledWith(
      BOOK_BYTES,
      BOOK_NAME,
      "application/x-openkk",
    );
  });

  it("downloads the book when the browser refuses to open its save picker", async () => {
    stubBrowser({
      showSaveFilePicker: async () => {
        throw new DOMException("no user activation", "SecurityError");
      },
      pointerIsCoarse: false,
      share: null,
    });

    const result = await deliverBookFile(BOOK_BYTES, BOOK_NAME);

    expect(result).toBe("saved");
    expect(browserFiles.save).toHaveBeenCalledOnce();
  });

  it("hands the book to the share sheet on a touch device without a save picker", async () => {
    const share = vi.fn(async (_data: { files: File[] }) => {});
    stubBrowser({ showSaveFilePicker: null, pointerIsCoarse: true, share });

    const result = await deliverBookFile(BOOK_BYTES, BOOK_NAME);

    expect(result).toBe("saved");
    expect(share.mock.calls[0]?.[0].files[0]?.name).toBe(BOOK_NAME);
    expect(browserFiles.save).not.toHaveBeenCalled();
  });

  it("reports a cancelled save when the user closes the share sheet", async () => {
    stubBrowser({
      showSaveFilePicker: null,
      pointerIsCoarse: true,
      share: async () => {
        throw new DOMException("closed", "AbortError");
      },
    });

    const result = await deliverBookFile(BOOK_BYTES, BOOK_NAME);

    expect(result).toBe("cancelled");
    expect(browserFiles.save).not.toHaveBeenCalled();
  });
});
