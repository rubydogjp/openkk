import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestAppInstall,
  type InstallPromptEvent,
} from "./app-install.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadWithBrowser(browser: EventTarget) {
  vi.stubGlobal("window", browser);
  vi.stubGlobal("navigator", {});
  vi.resetModules();
  return import("./app-install.js");
}

function installPrompt(
  outcome: "accepted" | "dismissed",
): InstallPromptEvent {
  const event = new Event("beforeinstallprompt", {
    cancelable: true,
  }) as InstallPromptEvent;
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe("browserAppInstall", () => {
  it("keeps the install prompt captured before any page subscribes", async () => {
    const browser = new EventTarget();
    const addListener = vi.spyOn(browser, "addEventListener");
    const { browserAppInstall } = await loadWithBrowser(browser);
    const prompt = installPrompt("accepted");

    browser.dispatchEvent(prompt);

    expect(prompt.defaultPrevented).toBe(true);
    expect(browserAppInstall.getState()).toBe("available");
    expect(addListener).toHaveBeenCalledTimes(2);
  });

  it("consumes the single-use prompt and notifies subscribers", async () => {
    const browser = new EventTarget();
    const { browserAppInstall } = await loadWithBrowser(browser);
    const changed = vi.fn();
    const unsubscribe = browserAppInstall.subscribe(changed);
    const prompt = installPrompt("accepted");
    browser.dispatchEvent(prompt);

    await expect(browserAppInstall.request()).resolves.toBe("installed");
    expect(prompt.prompt).toHaveBeenCalledOnce();
    expect(browserAppInstall.getState()).toBe("unavailable");
    await expect(browserAppInstall.request()).resolves.toBe("unsupported");

    browser.dispatchEvent(new Event("appinstalled"));
    expect(browserAppInstall.getState()).toBe("installed");
    expect(changed).toHaveBeenCalledTimes(3);
    unsubscribe();
    browser.dispatchEvent(new Event("appinstalled"));
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("reports a standalone launch as installed", async () => {
    const browser = Object.assign(new EventTarget(), {
      matchMedia: (query: string) => ({
        matches: query === "(display-mode: standalone)",
      }),
    });
    const { browserAppInstall } = await loadWithBrowser(browser);

    expect(browserAppInstall.getState()).toBe("installed");
  });

  it("falls back to the experimental navigator.install API", async () => {
    const browser = new EventTarget();
    const install = vi.fn(async () => undefined);
    vi.stubGlobal("window", browser);
    vi.stubGlobal("navigator", { install });
    vi.resetModules();
    const { browserAppInstall } = await import("./app-install.js");

    expect(browserAppInstall.getState()).toBe("available");
    await expect(browserAppInstall.request()).resolves.toBe("installed");
    expect(install).toHaveBeenCalledOnce();
  });
});

describe("requestAppInstall", () => {
  it("distinguishes a user dismissal from an unsupported prompt", async () => {
    await expect(
      requestAppInstall({ prompt: installPrompt("dismissed"), install: null }),
    ).resolves.toBe("dismissed");
  });

  it("contains prompt and experimental API failures", async () => {
    const prompt = {
      prompt: vi.fn(async () => {
        throw new Error("prompt already consumed");
      }),
      userChoice: new Promise(() => undefined),
    } as unknown as InstallPromptEvent;

    await expect(requestAppInstall({ prompt, install: null })).resolves.toBe(
      "unsupported",
    );
    await expect(
      requestAppInstall({
        prompt: null,
        install: async () => {
          throw new Error("not allowed");
        },
      }),
    ).resolves.toBe("unsupported");
  });
});
