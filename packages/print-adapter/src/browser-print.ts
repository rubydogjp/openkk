const PRINT_FRAME_LOAD_TIMEOUT_MS = 3000;
const PRINT_FRAME_REMOVAL_DELAY_MS = 100;
const PRINT_FRAME_MAX_LIFETIME_MS = 60_000;

export function openBrowserPrintFrame(html: string): void {
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

  let printTriggered = false;
  let frameRemoved = false;
  let printCompletionHandled = false;
  let frameAfterPrint: (() => void) | null = null;
  let windowAfterPrint: (() => void) | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function scheduleTask(fn: () => void, delayMilliseconds: number): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, delayMilliseconds);
    timers.add(timer);
  }

  function removePrintFrame() {
    if (frameRemoved) return;
    frameRemoved = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    if (frameAfterPrint != null) {
      iframe.contentWindow?.removeEventListener(
        "afterprint",
        frameAfterPrint,
      );
      frameAfterPrint = null;
    }
    if (windowAfterPrint != null) {
      window.removeEventListener("afterprint", windowAfterPrint);
      windowAfterPrint = null;
    }
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }

  function triggerFramePrint() {
    if (printTriggered) return;
    printTriggered = true;
    const win = iframe.contentWindow;
    if (!win) {
      removePrintFrame();
      return;
    }
    const handlePrintCompletion = () => {
      if (printCompletionHandled) return;
      printCompletionHandled = true;
      scheduleTask(removePrintFrame, PRINT_FRAME_REMOVAL_DELAY_MS);
    };
    frameAfterPrint = handlePrintCompletion;
    windowAfterPrint = handlePrintCompletion;
    win.addEventListener("afterprint", frameAfterPrint);
    window.addEventListener("afterprint", windowAfterPrint);
    try {
      win.focus();
      win.print();
    } catch {
      removePrintFrame();
      return;
    }
    scheduleTask(removePrintFrame, PRINT_FRAME_MAX_LIFETIME_MS);
  }

  iframe.addEventListener("load", triggerFramePrint, { once: true });
  document.body.appendChild(iframe);

  scheduleTask(triggerFramePrint, PRINT_FRAME_LOAD_TIMEOUT_MS);
}
