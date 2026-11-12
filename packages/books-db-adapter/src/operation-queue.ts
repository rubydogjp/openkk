export type OperationQueue = {
  run<Result>(operation: () => Promise<Result> | Result): Promise<Result>;
};

export function createOperationQueue(): OperationQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<Result>(operation: () => Promise<Result> | Result): Promise<Result> {
      const started = async () => await operation();
      const result = tail.then(started, started);
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
}

export function runThroughQueue<Namespace extends object>(
  queue: OperationQueue,
  namespace: Namespace,
): Namespace {
  return new Proxy(namespace, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver) as unknown;
      if (typeof member !== "function") return member;
      return (...args: unknown[]) =>
        queue.run(() => Reflect.apply(member, target, args) as unknown);
    },
  });
}
