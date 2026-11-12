export function serializePortOperations<Namespaces extends object>(
  namespaces: Namespaces,
): Namespaces {
  const queue = new SerializedOperationQueue();
  const serialized: Record<string, unknown> = {};
  for (const [name, namespace] of Object.entries(namespaces)) {
    serialized[name] = serializeNamespace(namespace as object, queue);
  }
  return serialized as Namespaces;
}

function serializeNamespace<Namespace extends object>(
  namespace: Namespace,
  queue: SerializedOperationQueue,
): Namespace {
  return new Proxy(namespace, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver) as unknown;
      if (typeof member !== "function") return member;
      return (...args: unknown[]) =>
        queue.run(async () => await Reflect.apply(member, target, args));
    },
  });
}

class SerializedOperationQueue {
  #tail: Promise<void> = Promise.resolve();

  run<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}
