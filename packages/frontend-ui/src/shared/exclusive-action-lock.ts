export class ExclusiveActionLock {
  #locked = false;

  get isLocked(): boolean {
    return this.#locked;
  }

  tryAcquire(): (() => void) | null {
    if (this.#locked) return null;
    this.#locked = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#locked = false;
    };
  }
}
