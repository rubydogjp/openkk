import { afterEach, describe, expect, it, vi } from "vitest";

import { openBrowserPrintFrame } from "./browser-print.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("openBrowserPrintFrame", () => {
  it("prints after load and removes both afterprint listeners", () => {
    vi.useFakeTimers();
    const frameListeners = new Map<string, () => void>();
    const windowListeners = new Map<string, () => void>();
    const frameWindow = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        frameListeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (frameListeners.get(type) === listener) frameListeners.delete(type);
      }),
      focus: vi.fn(),
      print: vi.fn(),
    };
    const iframeListeners = new Map<string, () => void>();
    const removeChild = vi.fn();
    const iframe = {
      setAttribute: vi.fn(),
      tabIndex: 0,
      style: {} as Record<string, string>,
      srcdoc: "",
      contentWindow: frameWindow,
      parentNode: { removeChild },
      addEventListener: vi.fn((type: string, listener: () => void) => {
        iframeListeners.set(type, listener);
      }),
    };
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        windowListeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (windowListeners.get(type) === listener) {
          windowListeners.delete(type);
        }
      }),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => iframe),
      body: {
        appendChild: vi.fn(() => iframeListeners.get("load")?.()),
      },
    });

    openBrowserPrintFrame("<html><body>帳票</body></html>");
    expect(frameWindow.print).toHaveBeenCalledOnce();

    frameListeners.get("afterprint")?.();
    windowListeners.get("afterprint")?.();
    vi.advanceTimersByTime(100);

    expect(removeChild).toHaveBeenCalledOnce();
    expect(frameWindow.removeEventListener).toHaveBeenCalledOnce();
    expect(window.removeEventListener).toHaveBeenCalledOnce();
    expect(frameListeners.has("afterprint")).toBe(false);
    expect(windowListeners.has("afterprint")).toBe(false);
  });

  it("does nothing during server-side rendering", () => {
    vi.stubGlobal("document", undefined);

    expect(() => openBrowserPrintFrame("<html></html>")).not.toThrow();
  });
});
