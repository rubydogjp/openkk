export function resolveCategoryId(
  explicitId: string | null,
  name: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
  blankFallbackId: string,
): string {
  if (explicitId !== null) return explicitId;
  const value = name.trim();
  if (value === "") return blankFallbackId;
  return (
    categories.find((category) => category.id === value)?.id ??
    categories.find((category) => category.name === value)?.id ??
    value
  );
}
