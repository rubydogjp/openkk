export function formatBookSaveDate(savedAt: number, now: number): string {
  const saved = new Date(savedAt);
  const monthDay = `${saved.getMonth() + 1}/${saved.getDate()}`;
  return saved.getFullYear() === new Date(now).getFullYear()
    ? monthDay
    : `${saved.getFullYear()}/${monthDay}`;
}

export function bookSaveStatusLabel(
  state: { hasUnsavedChanges: boolean; lastSavedAt: number | null },
  now: number,
): string {
  if (state.hasUnsavedChanges) return "保存していない変更があります";
  return state.lastSavedAt == null
    ? ""
    : `前回 ${formatBookSaveDate(state.lastSavedAt, now)}`;
}
