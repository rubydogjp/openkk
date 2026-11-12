export class KeyedAsyncMutationQueue<Key> {
  readonly #tails = new Map<Key, Promise<void>>();

  run<Value>(key: Key, operation: () => Promise<Value>): Promise<Value> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => {},
      () => {},
    );
    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return result;
  }
}

export class AsyncMutationQueue {
  readonly #queue = new KeyedAsyncMutationQueue<null>();

  run<Value>(operation: () => Promise<Value>): Promise<Value> {
    return this.#queue.run(null, operation);
  }
}
