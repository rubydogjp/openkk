export const ENTRIES_PATH = "/entries";
export const ENTRIES_VIEW_PARAM = "view";
export const ENTRIES_SHEET_VIEW = "sheet";

export function showsEntriesSheet(
  pathname: string,
  searchParams: { get(name: string): string | null },
): boolean {
  return (
    pathname === ENTRIES_PATH &&
    searchParams.get(ENTRIES_VIEW_PARAM) === ENTRIES_SHEET_VIEW
  );
}
