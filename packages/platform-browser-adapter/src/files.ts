import type { PlatformFiles } from "@rubydogjp/openkk-client-ports";

export const browserFiles: PlatformFiles = {
  save(bytes, filename, mimeType) {
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy.buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    try {
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      revokeObjectUrlAfterCurrentTask(url);
    }
  },
};

function revokeObjectUrlAfterCurrentTask(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
