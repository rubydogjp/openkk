import type { PrintPort } from "@rubydogjp/openkk-driver";
import { openBrowserPrintFrame } from "./browser-print.js";

export const browserPrintAdapter: PrintPort = {
  openPrint: openBrowserPrintFrame,
};
