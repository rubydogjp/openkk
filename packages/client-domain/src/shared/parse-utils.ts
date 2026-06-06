export function parseAmount(value: string | number): number {
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.round(value) : 0;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function parseBusinessRate(value: string): number {
  if (value.trim() === "") return 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(100, n)) / 100;
}

export function parseIsoLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  )
    return null;
  return date;
}

export function formatIsoLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export const WEEKDAY_LABELS_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function weekdayJa(dateText: string): string {
  const date = parseIsoLocalDate(dateText);
  if (date == null) return "";
  return WEEKDAY_LABELS_JA[date.getDay()] ?? "";
}
