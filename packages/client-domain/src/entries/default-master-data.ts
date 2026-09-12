export * from "./generated-master-data.js";

export function mergeOptions(
  primary: Iterable<string>,
  secondary: Iterable<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...primary, ...secondary]) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
