export function applyPatch<T extends object, K extends keyof T>(
  current: T,
  patch: { [P in K]?: T[P] },
  keys: ReadonlyArray<K>,
): T {
  const next = { ...current };
  for (const key of keys) {
    const value = patch[key];
    if (value !== undefined) next[key] = value as T[K];
  }
  return next;
}
