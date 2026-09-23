import { describe, expect, it } from "vitest";

import type { OpenkkDbPort } from "@rubydogjp/openkk-server-ports";
import { LOCAL_AUTH_PENDING_LIMIT } from "./local-auth.js";
import { createServerUsecases } from "./usecases.js";

describe("local auth use case", () => {
  it("accepts issued authorization data and consumes each code once", async () => {
    const auth = createServerUsecases({} as OpenkkDbPort).auth;
    const started = await auth.startSession("https://example.test/auth/result");
    const target = new URL(started.authUrl);
    const state = target.searchParams.get("state")!;
    const code = target.searchParams.get("code")!;

    const completed = await auth.completeSession(state, code);
    await expect(
      auth.redeemCompletionCode(completed.completionCode),
    ).resolves.toBeUndefined();
    await expect(auth.completeSession(state, code)).rejects.toThrow(
      /invalid or expired/,
    );
    await expect(
      auth.redeemCompletionCode(completed.completionCode),
    ).rejects.toThrow(/invalid or expired/);
  });

  it("rejects authorization data that was never issued", async () => {
    const auth = createServerUsecases({} as OpenkkDbPort).auth;
    await expect(auth.completeSession("made-up", "made-up")).rejects.toThrow(
      /invalid or expired/,
    );
  });

  it("rejects non-http redirect URLs and credential-bearing URLs", async () => {
    const auth = createServerUsecases({} as OpenkkDbPort).auth;
    await expect(auth.startSession("javascript:alert(1)")).rejects.toThrow(
      /not allowed/,
    );
    await expect(
      auth.startSession("https://user:secret@example.test/result"),
    ).rejects.toThrow(/not allowed/);
  });

  it("rejects malformed runtime values with validation errors", async () => {
    const auth = createServerUsecases({} as OpenkkDbPort).auth;

    await expect(auth.startSession(null)).rejects.toThrow(
      /auth redirect URL is required/,
    );
    await expect(auth.completeSession(null, "code")).rejects.toThrow(
      /auth state is required/,
    );
    await expect(auth.redeemCompletionCode(null)).rejects.toThrow(
      /auth completion code is required/,
    );
  });

  it("bounds pending authorization requests and evicts the oldest", async () => {
    const auth = createServerUsecases({} as OpenkkDbPort).auth;
    const issued = [];
    for (let index = 0; index <= LOCAL_AUTH_PENDING_LIMIT; index += 1) {
      const started = await auth.startSession(
        "https://example.test/auth/result",
      );
      const target = new URL(started.authUrl);
      issued.push({
        state: target.searchParams.get("state")!,
        code: target.searchParams.get("code")!,
      });
    }

    await expect(
      auth.completeSession(issued[0]!.state, issued[0]!.code),
    ).rejects.toThrow(/invalid or expired/);
    await expect(
      auth.completeSession(issued.at(-1)!.state, issued.at(-1)!.code),
    ).resolves.toHaveProperty("completionCode");
  });

  it("bounds unredeemed completion codes and evicts the oldest", async () => {
    const auth = createServerUsecases({} as OpenkkDbPort).auth;
    const completions: string[] = [];
    for (let index = 0; index <= LOCAL_AUTH_PENDING_LIMIT; index += 1) {
      const started = await auth.startSession(
        "https://example.test/auth/result",
      );
      const target = new URL(started.authUrl);
      const completed = await auth.completeSession(
        target.searchParams.get("state")!,
        target.searchParams.get("code")!,
      );
      completions.push(completed.completionCode);
    }

    await expect(auth.redeemCompletionCode(completions[0]!)).rejects.toThrow(
      /invalid or expired/,
    );
    await expect(
      auth.redeemCompletionCode(completions.at(-1)!),
    ).resolves.toBeUndefined();
  });
});
