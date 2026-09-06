export type ExternalWindowOpener = (
  url: string,
  target: string,
  features: string,
) => unknown;

export function openExternalUrl(
  url: string,
  opener: ExternalWindowOpener = window.open.bind(window),
): void {
  opener(url, "_blank", "noopener,noreferrer");
}
