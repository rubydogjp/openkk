export class AsyncStateVersion<Key> {
  readonly #versions = new Map<Key, number>();

  capture(key: Key): number {
    return this.#versions.get(key) ?? 0;
  }

  invalidate(key: Key): number {
    const next = this.capture(key) + 1;
    this.#versions.set(key, next);
    return next;
  }

  isCurrent(key: Key, capturedVersion: number): boolean {
    return this.capture(key) === capturedVersion;
  }
}
