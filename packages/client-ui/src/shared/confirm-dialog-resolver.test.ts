import { describe, expect, it, vi } from "vitest";

import { ConfirmDialogResolver } from "./confirm-dialog-resolver.js";

describe("ConfirmDialogResolver", () => {
  it("cancels the previous request before replacing it", () => {
    const resolver = new ConfirmDialogResolver();
    const first = vi.fn();
    const second = vi.fn();

    resolver.start(first);
    resolver.start(second);

    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith(false);
    expect(second).not.toHaveBeenCalled();

    resolver.settle(true);
    expect(second).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith(true);
  });

  it("settles each request at most once", () => {
    const resolver = new ConfirmDialogResolver();
    const resolve = vi.fn();

    resolver.start(resolve);
    resolver.settle(false);
    resolver.settle(true);

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(false);
  });
});
