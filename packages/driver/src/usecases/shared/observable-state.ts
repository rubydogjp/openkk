export type StateListener = () => void;

export type ReadableState<Value> = {
  getState(): Value;
  subscribe(listener: StateListener): () => void;
};

export type WritableState<Value> = ReadableState<Value> & {
  setState(next: Value): void;
};

export function createWritableState<Value>(
  initial: Value,
): WritableState<Value> {
  let current = initial;
  const listeners = new Set<StateListener>();
  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setState(next) {
      if (Object.is(current, next)) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

export function deriveState<Source, Value>(
  source: ReadableState<Source>,
  derive: (source: Source) => Value,
): ReadableState<Value> {
  let derivedFrom: { source: Source; value: Value } | null = null;
  return {
    getState() {
      const current = source.getState();
      if (derivedFrom == null || !Object.is(derivedFrom.source, current)) {
        derivedFrom = { source: current, value: derive(current) };
      }
      return derivedFrom.value;
    },
    subscribe: (listener) => source.subscribe(listener),
  };
}
