export class AppLockUnavailableError extends Error {
  constructor() {
    super("this browser cannot keep the books to a single tab");
    this.name = "AppLockUnavailableError";
  }
}

export type AppLockManager = {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void> | null,
  ): Promise<unknown>;
};

export type AppLock = {
  hold(name: string, onWaiting: () => void): Promise<() => void>;
};

export function createAppLock(locks: AppLockManager | null): AppLock {
  return {
    async hold(name, onWaiting) {
      if (locks == null) throw new AppLockUnavailableError();
      const manager = locks;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const request = (ifAvailable: boolean) =>
        new Promise<boolean>((resolve, reject) => {
          manager
            .request(name, { mode: "exclusive", ifAvailable }, (lock) => {
              resolve(lock != null);
              return lock != null ? held : null;
            })
            .catch(reject);
        });
      if (await request(true)) return release;
      onWaiting();
      await request(false);
      return release;
    },
  };
}

export const browserAppLock = createAppLock(
  typeof navigator === "object" && navigator.locks != null
    ? navigator.locks
    : null,
);
