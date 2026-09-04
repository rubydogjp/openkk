import type { PrintPort } from "@rubydogjp/openkk-client-ports";
import { openBrowserPrintFrame } from "./browser-print.js";

export const printAdapter: PrintPort = {
  openPrint: openBrowserPrintFrame,
};
