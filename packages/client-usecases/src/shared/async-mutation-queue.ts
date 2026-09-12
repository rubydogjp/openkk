export class AsyncMutationQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}

export class KeyedAsyncMutationQueue<Key> {
  private readonly tails = new Map<Key, Promise<void>>();

  run<Value>(key: Key, operation: () => Promise<Value>): Promise<Value> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => {},
      () => {},
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
}
