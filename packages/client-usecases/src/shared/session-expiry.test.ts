import { describe, expect, it, vi } from "vitest";
import { AppError } from "@rubydogjp/openkk-client-domain";
import type { OpenkkBackendPort } from "@rubydogjp/openkk-client-ports";

import {
  isSessionExpiredError,
  wrapWithSessionExpiry,
} from "./session-expiry.js";

function appError(statusCode: number | null) {
  return new AppError({
    messageForDeveloper: "test",
    messageForUser: "test",
    originalMessage: null,
    statusCode,
    code: null,
  });
}

function fakeApi(fail: (name: string) => unknown) {
  const call = (name: string) => async () => {
    const error = fail(name);
    if (error != null) throw error;
    return name;
  };
  return {
    auth: { signOut: call("auth.signOut") },
    fiscalPeriods: { getAll: call("fiscalPeriods.getAll") },
    entries: { list: call("entries.list") },
  } as unknown as OpenkkBackendPort;
}

describe("isSessionExpiredError", () => {
  it("statusCode が 401 のエラーだけを、サインインが切れたとみなす", () => {
    expect(isSessionExpiredError(appError(401))).toBe(true);
    expect(isSessionExpiredError({ statusCode: 401 })).toBe(true);
    expect(isSessionExpiredError(appError(403))).toBe(false);
    expect(isSessionExpiredError(appError(null))).toBe(false);
    expect(isSessionExpiredError(new Error("network"))).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
  });
});

describe("wrapWithSessionExpiry", () => {
  it("401 を受けたら、呼び出しを始めたときの世代を渡し、エラーは投げ直す", async () => {
    let version = 3;
    const expire = vi.fn();
    const api = wrapWithSessionExpiry(
      fakeApi(() => appError(401)),
      { captureAuthVersion: () => version, expireIfAuthUnchangedSince: expire },
    );
    const pending = api.fiscalPeriods.getAll();
    version = 4;
    await expect(pending).rejects.toMatchObject({ statusCode: 401 });
    expect(expire).toHaveBeenCalledWith(3);
  });

  it("401 以外のエラーと成功では何もしない", async () => {
    const expire = vi.fn();
    const failing = wrapWithSessionExpiry(
      fakeApi(() => appError(500)),
      {
        captureAuthVersion: () => 0,
        expireIfAuthUnchangedSince: expire,
      },
    );
    await expect(failing.fiscalPeriods.getAll()).rejects.toMatchObject({
      statusCode: 500,
    });
    const ok = wrapWithSessionExpiry(
      fakeApi(() => null),
      {
        captureAuthVersion: () => 0,
        expireIfAuthUnchangedSince: expire,
      },
    );
    await expect(ok.fiscalPeriods.getAll()).resolves.toBe(
      "fiscalPeriods.getAll",
    );
    expect(expire).not.toHaveBeenCalled();
  });

  it("auth の 401 では何もしない", async () => {
    const expire = vi.fn();
    const api = wrapWithSessionExpiry(
      fakeApi(() => appError(401)),
      {
        captureAuthVersion: () => 0,
        expireIfAuthUnchangedSince: expire,
      },
    );
    await expect(api.auth.signOut()).rejects.toMatchObject({ statusCode: 401 });
    expect(expire).not.toHaveBeenCalled();
  });
});
