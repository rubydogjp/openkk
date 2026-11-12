export const MAX_TEXT_FIELD_LENGTH = 400;

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).replace(/[\uD800-\uDBFF]$/, "");
}
