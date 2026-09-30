import type {
  PlatformAppInstall,
  PlatformAppInstallOutcome,
  PlatformAppInstallState,
} from "@rubydogjp/openkk-client-ports";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type NavigatorWithExperimentalInstall = Navigator & {
  install: unknown;
  standalone: unknown;
};

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

function isStandalone(): boolean {
  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return (
    displayModeStandalone ||
    (typeof navigator !== "undefined" &&
      (navigator as NavigatorWithExperimentalInstall).standalone === true)
  );
}

function experimentalInstall(): (() => Promise<unknown>) | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as NavigatorWithExperimentalInstall;
  const install = nav.install;
  return typeof install === "function"
    ? () => Promise.resolve(install.call(nav))
    : null;
}

function takeDeferredPrompt(): InstallPromptEvent | null {
  const prompt = deferredPrompt;
  deferredPrompt = null;
  if (prompt != null) notify();
  return prompt;
}

export async function requestAppInstall(input: {
  prompt: InstallPromptEvent | null;
  install: (() => Promise<unknown>) | null;
}): Promise<PlatformAppInstallOutcome> {
  if (input.prompt != null) {
    try {
      await input.prompt.prompt();
      const choice = await input.prompt.userChoice;
      return choice.outcome === "accepted" ? "installed" : "dismissed";
    } catch {
      return "unsupported";
    }
  }
  if (input.install != null) {
    try {
      await input.install();
      return "installed";
    } catch {
      return "unsupported";
    }
  }
  return "unsupported";
}

export const browserAppInstall: PlatformAppInstall = {
  getState(): PlatformAppInstallState {
    if (typeof window === "undefined") return "unavailable";
    if (installed || isStandalone()) return "installed";
    if (deferredPrompt != null || experimentalInstall() != null) {
      return "available";
    }
    return "unavailable";
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  request() {
    const prompt = takeDeferredPrompt();
    return requestAppInstall({
      prompt,
      install: prompt == null ? experimentalInstall() : null,
    });
  },
};
