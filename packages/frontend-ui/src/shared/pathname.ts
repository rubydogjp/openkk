export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
}

export function pathWithSearchParams(
  pathname: string,
  params: URLSearchParams,
): string {
  const query = params.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}
