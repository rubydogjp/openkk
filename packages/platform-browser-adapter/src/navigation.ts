import type { PlatformNavigation } from "@rubydogjp/openkk-client-ports";

export const browserNavigation: PlatformNavigation = {
  appUrl(path) {
    return new URL(path, window.location.origin).href;
  },
  openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  leaveTo(url) {
    window.location.assign(url);
  },
  reloadAt(path) {
    window.location.replace(path);
  },
};
