import type { PlatformClipboard } from "@rubydogjp/openkk-client-ports";

export const browserClipboard: PlatformClipboard = {
  async writeText(text) {
    if (typeof navigator === "undefined" || navigator.clipboard == null) {
      throw new Error("Clipboard API is not available");
    }
    await navigator.clipboard.writeText(text);
  },
};
