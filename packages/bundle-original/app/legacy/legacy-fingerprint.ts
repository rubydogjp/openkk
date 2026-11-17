export type FingerprintedPeriodContent = {
  fiscalPeriod: object;
  entries: ReadonlyArray<{ id: string }>;
  fixedAssets: ReadonlyArray<{ id: string }>;
};

function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, withSortedKeys(item)]),
  );
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function hex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function fingerprintBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return hex(await globalThis.crypto.subtle.digest("SHA-256", copy));
}

export function canonicalPeriodContent(
  period: FingerprintedPeriodContent,
): string {
  return JSON.stringify(
    withSortedKeys({
      fiscalPeriod: period.fiscalPeriod,
      entries: [...period.entries].sort(byId),
      fixedAssets: [...period.fixedAssets].sort(byId),
    }),
  );
}

export async function fingerprintPeriodContent(
  period: FingerprintedPeriodContent,
): Promise<string> {
  return fingerprintBytes(
    new TextEncoder().encode(canonicalPeriodContent(period)),
  );
}
