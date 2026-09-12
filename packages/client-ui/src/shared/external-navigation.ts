export type ExternalWindowOpener = (
  url: string,
  target: string,
  features: string,
) => unknown;

export function openExternalUrl(
  url: string,
  opener: ExternalWindowOpener | null,
): void {
  (opener ?? window.open.bind(window))(url, "_blank", "noopener,noreferrer");
}
