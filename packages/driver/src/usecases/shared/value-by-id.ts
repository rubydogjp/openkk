export function valueById<Item extends { id: string }, Value>(
  items: ReadonlyArray<Item>,
  value: (item: Item) => Value,
): Record<string, Value> {
  return Object.fromEntries(items.map((item) => [item.id, value(item)]));
}
