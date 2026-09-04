import type { OpenkkDbPort } from "../db-adapter.js";

export function serializeOpenkkDbPortOperations(
  port: OpenkkDbPort,
): OpenkkDbPort {
  const queue = new SerializedOperationQueue();
  const serializeNamespace = <T extends object>(namespace: T): T =>
    new Proxy(namespace, {
      get(target, property, receiver) {
        const member = Reflect.get(target, property, receiver) as unknown;
        if (typeof member !== "function") return member;
        return (...args: unknown[]) =>
          queue.run(async () => await Reflect.apply(member, target, args));
      },
    });

  return {
    fiscalPeriods: serializeNamespace(port.fiscalPeriods),
    entries: serializeNamespace(port.entries),
    fixedAssets: serializeNamespace(port.fixedAssets),
    preClosings: serializeNamespace(port.preClosings),
    closings: serializeNamespace(port.closings),
    masterData: serializeNamespace(port.masterData),
  };
}

class SerializedOperationQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
