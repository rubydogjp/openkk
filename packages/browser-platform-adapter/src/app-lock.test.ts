import { describe, expect, it, vi } from "vitest";

import {
  AppLockUnavailableError,
  createAppLock,
  type AppLockManager,
} from "./app-lock.js";

function fakeLockManager(): AppLockManager {
  const held = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  return {
    async request(name, options, callback) {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        await new Promise<void>((resolve) => {
          waiting.set(name, [...(waiting.get(name) ?? []), resolve]);
        });
      }
      held.add(name);
      await callback({ name });
      held.delete(name);
      waiting.get(name)?.shift()?.();
      return null;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("app lock", () => {
  it("holds the lock right away when no other tab has it", async () => {
    const lock = createAppLock(fakeLockManager());
    const onWaiting = vi.fn();

    const release = await lock.hold("books", onWaiting);

    expect(onWaiting).not.toHaveBeenCalled();
    release();
  });

  it("tells that it is waiting and continues once the other tab lets go", async () => {
    const lock = createAppLock(fakeLockManager());
    const releaseFirst = await lock.hold("books", () => {});
    const onWaiting = vi.fn();
    let secondHeld = false;

    const second = lock.hold("books", onWaiting).then((release) => {
      secondHeld = true;
      return release;
    });
    await settle();
    expect(onWaiting).toHaveBeenCalledTimes(1);
    expect(secondHeld).toBe(false);
    releaseFirst();
    const releaseSecond = await second;

    expect(secondHeld).toBe(true);
    releaseSecond();
  });

  it("does not block a different lock", async () => {
    const lock = createAppLock(fakeLockManager());
    const onWaiting = vi.fn();

    await lock.hold("books", () => {});
    await lock.hold("legacy", onWaiting);

    expect(onWaiting).not.toHaveBeenCalled();
  });

  it("refuses to run without a lock manager", async () => {
    await expect(
      createAppLock(null).hold("books", () => {}),
    ).rejects.toBeInstanceOf(AppLockUnavailableError);
  });
});
