

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
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function later(fn: () => void, ms: number): void {
    const timer = setTimeout(fn, ms);
    timers.add(timer);
  }

  function removeIframe() {
    if (removed) return;
    removed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
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
    // afterprint may fire on the iframe or the parent window depending on the
    // engine; whichever comes first removes the iframe shortly after.
    const onAfterPrint = () => later(removeIframe, 100);
    win.addEventListener("afterprint", onAfterPrint, { once: true });
    window.addEventListener("afterprint", onAfterPrint, { once: true });
    try {
      win.focus();
      win.print();
    } catch {
      removeIframe();
      return;
    }
    // Fallback for engines that never fire afterprint: remove well after any
    // realistic print interaction so the hidden iframe cannot leak.
    later(removeIframe, 60_000);
  }

  iframe.addEventListener("load", triggerPrint, { once: true });
  document.body.appendChild(iframe);

  // Fallback in case "load" never fires (e.g. srcdoc blocked).
  later(triggerPrint, 3000);
}

export const printAdapter: PrintPort = {
  openPrint,
};
