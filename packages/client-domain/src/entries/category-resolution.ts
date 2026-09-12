export function resolveCategoryId(
  explicitId: string | null,
  name: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
  blankFallbackId: string,
): string {
  const value = explicitId?.trim() || name.trim();
  if (value === "") return blankFallbackId;
  return (
    categories.find((category) => category.id === value)?.id ??
    categories.find((category) => category.name === value)?.id ??
    value
  );
}
