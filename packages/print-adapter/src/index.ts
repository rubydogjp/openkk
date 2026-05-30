

import type { PrintPort } from "@rubydogjp/openkk-client-ports";

function openPrint(html: string): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  iframe.srcdoc = html;

  let printed = false;
  let removed = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;

  function removeIframe() {
    if (removed) return;
    removed = true;
    if (safetyTimer != null) clearTimeout(safetyTimer);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }

  function triggerPrint() {
    if (printed) return;
    printed = true;
    const win = iframe.contentWindow;
    if (!win) {
      removeIframe();
      return;
    }
    win.addEventListener(
      "afterprint",
      () => {

        setTimeout(removeIframe, 100);
      },
      { once: true },
    );
    try {
      win.focus();
      win.print();
    } catch {
      removeIframe();
    }
  }

  iframe.addEventListener("load", triggerPrint, { once: true });
  document.body.appendChild(iframe);

  safetyTimer = setTimeout(triggerPrint, 3000);
}

export const printAdapter: PrintPort = {
  openPrint,
};
