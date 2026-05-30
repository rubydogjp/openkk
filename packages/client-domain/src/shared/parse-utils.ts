export function parseAmount(value: string | number): number {
  if (typeof value === "number") return Math.round(value);
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function parseBusinessRate(value: string): number {
  if (value.trim() === "") return 1;
  const n = Number(value);
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(100, n)) / 100;
}
