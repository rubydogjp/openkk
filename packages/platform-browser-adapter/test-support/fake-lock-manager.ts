import type { BookLockManager } from "../src/book-lock.js";

export function fakeLockManager(): BookLockManager {
  const held = new Set<string>();
  return {
    async request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      await callback({ name });
      held.delete(name);
      return null;
    },
  };
}

export function settleLocks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
