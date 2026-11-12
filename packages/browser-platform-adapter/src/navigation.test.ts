import { afterEach, describe, expect, it, vi } from "vitest";

import { browserNavigation } from "./navigation.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubWindow() {
  const location = {
    origin: "https://app.example.test",
    assign: vi.fn(),
    replace: vi.fn(),
  };
  const open = vi.fn();
  vi.stubGlobal("window", { location, open });
  return { location, open };
}

describe("browserNavigation", () => {
  it("resolves in-app paths against the current origin", () => {
    stubWindow();

    expect(browserNavigation.appUrl("/auth/result")).toBe(
      "https://app.example.test/auth/result",
    );
  });

  it("opens a new context without an opener or referrer", () => {
    const { open } = stubWindow();

    browserNavigation.openExternal("https://example.com/");

    expect(open).toHaveBeenCalledWith(
      "https://example.com/",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("leaves the app in the current context and reloads without history", () => {
    const { location } = stubWindow();

    browserNavigation.leaveTo("https://auth.example.test/authorize");
    browserNavigation.reloadAt("/fiscal-periods");

    expect(location.assign).toHaveBeenCalledWith(
      "https://auth.example.test/authorize",
    );
    expect(location.replace).toHaveBeenCalledWith("/fiscal-periods");
  });
});
