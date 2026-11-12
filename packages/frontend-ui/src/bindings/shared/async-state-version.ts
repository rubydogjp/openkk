export class KeyedAsyncStateVersion<Key> {
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

export class AsyncStateVersion {
  readonly #versions = new KeyedAsyncStateVersion<null>();

  capture(): number {
    return this.#versions.capture(null);
  }

  invalidate(): number {
    return this.#versions.invalidate(null);
  }

  isCurrent(capturedVersion: number): boolean {
    return this.#versions.isCurrent(null, capturedVersion);
  }
}
