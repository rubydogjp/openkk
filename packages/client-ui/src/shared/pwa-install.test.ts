import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestAppInstall,
  type InstallPromptEvent,
} from "./pwa-install.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("shares and consumes the browser install prompt across imports", async () => {
  const browser = new EventTarget();
  const addListener = vi.spyOn(browser, "addEventListener");
  vi.stubGlobal("window", browser);
  vi.resetModules();
  const state = await import("./pwa-install.js");
  const otherConsumer = await import("./pwa-install.js");
  const changed = vi.fn();
  const unsubscribe = state.subscribeInstallChange(changed);
  const prompt = new Event("beforeinstallprompt", { cancelable: true });

  browser.dispatchEvent(prompt);
  expect(prompt.defaultPrevented).toBe(true);
  expect(otherConsumer.getDeferredInstallPrompt()).toBe(prompt);
  expect(state.takeDeferredInstallPrompt()).toBe(prompt);
  expect(otherConsumer.takeDeferredInstallPrompt()).toBeNull();
  browser.dispatchEvent(new Event("appinstalled"));
  expect(state.isAppInstalled()).toBe(true);
  expect(changed).toHaveBeenCalledTimes(3);
  expect(addListener).toHaveBeenCalledTimes(2);
  unsubscribe();
});

describe("requestAppInstall", () => {
  it("reports an accepted deferred install prompt", async () => {
    const prompt = {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    } as unknown as InstallPromptEvent;

    await expect(requestAppInstall({ prompt, install: null })).resolves.toBe("installed");
    expect(prompt.prompt).toHaveBeenCalledOnce();
  });

  it("distinguishes a user dismissal from an unsupported prompt", async () => {
    const prompt = {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    } as unknown as InstallPromptEvent;

    await expect(requestAppInstall({ prompt, install: null })).resolves.toBe("dismissed");
  });

  it("contains prompt and experimental API failures", async () => {
    const prompt = {
      prompt: vi.fn(async () => {
        throw new Error("prompt already consumed");
      }),
      userChoice: new Promise(() => undefined),
    } as unknown as InstallPromptEvent;

    await expect(requestAppInstall({ prompt, install: null })).resolves.toBe("unsupported");
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
