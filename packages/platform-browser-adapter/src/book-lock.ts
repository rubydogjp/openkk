export class BookInUseError extends Error {
  constructor(readonly bookName: string) {
    super(`the book is open in another tab: ${bookName}`);
    this.name = "BookInUseError";
  }
}

export type BookLockManager = {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown) => Promise<void> | null,
  ): Promise<unknown>;
};

export type BookLocks = {
  hold(lockName: string, bookName: string): Promise<() => void>;
};

export function createBookLocks(locks: BookLockManager | null): BookLocks {
  return {
    async hold(lockName, bookName) {
      if (locks == null) return () => {};
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const acquired = await new Promise<boolean>((resolve) => {
        void locks.request(
          lockName,
          { mode: "exclusive", ifAvailable: true },
          (lock) => {
            resolve(lock != null);
            return lock != null ? held : null;
          },
        );
      });
      if (!acquired) throw new BookInUseError(bookName);
      return release;
    },
  };
}

export const browserBookLocks = createBookLocks(
  typeof navigator === "object" && navigator.locks != null
    ? navigator.locks
    : null,
);
