export type RejectionObserver = ((error: unknown) => void) | null;

export function observeRejectedCalls<T extends object>(
  target: T,
  startCall: (path: readonly PropertyKey[]) => RejectionObserver,
): T {
  return observeNode(target, [], startCall);
}

function observeNode<T extends object>(
  target: T,
  path: readonly PropertyKey[],
  startCall: (path: readonly PropertyKey[]) => RejectionObserver,
): T {
  return new Proxy(target, {
    get(node, key, receiver) {
      const value = Reflect.get(node, key, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const observer = startCall([...path, key]);
          const result = (value as (...args: unknown[]) => unknown).apply(
            node,
            args,
          );
          if (observer == null || !(result instanceof Promise)) return result;
          return result.catch((error: unknown) => {
            observer(error);
            throw error;
          });
        };
      }
      if (value != null && typeof value === "object") {
        return observeNode(value, [...path, key], startCall);
      }
      return value;
    },
  });
}
