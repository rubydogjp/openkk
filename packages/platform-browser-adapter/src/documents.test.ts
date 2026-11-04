import { describe, expect, it } from "vitest";

import {
  createHandleDocumentSink,
  type BrowserDocumentFileHandle,
} from "./documents.js";

function fakeHandle(initialModified: number) {
  const state = { lastModified: initialModified, bytes: new Uint8Array() };
  let clock = initialModified;
  const handle: BrowserDocumentFileHandle = {
    name: "帳簿.openkk",
    getFile: async () =>
      ({ lastModified: state.lastModified }) as unknown as File,
    createWritable: async () => {
      let pending = new Uint8Array();
      return {
        write: async (data) => {
          pending = new Uint8Array(data as ArrayBuffer);
        },
        close: async () => {
          state.bytes = pending;
          clock += 1000;
          state.lastModified = clock;
        },
      };
    },
  };
  const editElsewhere = () => {
    clock += 1000;
    state.lastModified = clock;
  };
  return { handle, state, editElsewhere };
}

describe("createHandleDocumentSink", () => {
  it("writes repeatedly while nobody else touches the file", async () => {
    const { handle, state } = fakeHandle(5000);
    const sink = createHandleDocumentSink(handle, 5000);

    expect(await sink.write(Uint8Array.of(1))).toBe("written");
    expect(await sink.write(Uint8Array.of(2))).toBe("written");
    expect([...state.bytes]).toEqual([2]);
  });

  it("refuses to overwrite a file changed by another app", async () => {
    const { handle, state, editElsewhere } = fakeHandle(5000);
    const sink = createHandleDocumentSink(handle, 5000);
    await sink.write(Uint8Array.of(1));

    editElsewhere();

    expect(await sink.write(Uint8Array.of(2))).toBe("conflict");
    expect([...state.bytes]).toEqual([1]);
  });

  it("writes a newly created file without a previous timestamp", async () => {
    const { handle, state } = fakeHandle(0);
    const sink = createHandleDocumentSink(handle, null);

    expect(await sink.write(Uint8Array.of(9))).toBe("written");
    expect([...state.bytes]).toEqual([9]);
    expect(sink.saveMode).toBe("auto");
    expect(sink.fileName).toBe("帳簿.openkk");
  });
});
