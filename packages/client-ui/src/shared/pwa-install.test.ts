import { describe, expect, it, vi } from "vitest";

import {
  requestAppInstall,
  type InstallPromptEvent,
} from "./pwa-install.js";

describe("requestAppInstall", () => {
  it("reports an accepted deferred install prompt", async () => {
    const prompt = {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    } as unknown as InstallPromptEvent;

    await expect(requestAppInstall({ prompt })).resolves.toBe("installed");
    expect(prompt.prompt).toHaveBeenCalledOnce();
  });

  it("distinguishes a user dismissal from an unsupported prompt", async () => {
    const prompt = {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    } as unknown as InstallPromptEvent;

    await expect(requestAppInstall({ prompt })).resolves.toBe("dismissed");
  });

  it("contains prompt and experimental API failures", async () => {
    const prompt = {
      prompt: vi.fn(async () => {
        throw new Error("prompt already consumed");
      }),
      userChoice: new Promise(() => undefined),
    } as unknown as InstallPromptEvent;

    await expect(requestAppInstall({ prompt })).resolves.toBe("unsupported");
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
