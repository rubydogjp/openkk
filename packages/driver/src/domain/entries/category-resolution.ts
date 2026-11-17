const CUSTOM_CATEGORY_PATTERN = /^カスタム\((.+)\)$/;

export function customCategoryLabel(id: string): string {
  return `カスタム(${id})`;
}

export function categoryDisplayName(
  id: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string {
  return (
    categories.find((category) => category.id === id)?.name ??
    customCategoryLabel(id)
  );
}

export function categoryTextValue(text: string): string {
  const value = text.trim();
  return CUSTOM_CATEGORY_PATTERN.exec(value)?.[1]?.trim() ?? value;
}

export function resolveCategoryId(
  explicitId: string | null,
  name: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
  blankFallbackId: string,
): string {
  if (explicitId !== null) return explicitId;
  const value = categoryTextValue(name);
  if (value === "") return blankFallbackId;
  return (
    categories.find((category) => category.id === value)?.id ??
    categories.find((category) => category.name === value)?.id ??
    value
  );
}
