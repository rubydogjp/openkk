export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const INSTALL_LISTENERS_KEY = "__openkkInstallPromptListenersRegistered";

type WindowWithInstallListenerFlag = Window & {
  [INSTALL_LISTENERS_KEY]?: boolean;
};

function notify(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  const installWindow = window as WindowWithInstallListenerFlag;
  if (!installWindow[INSTALL_LISTENERS_KEY]) {
    installWindow[INSTALL_LISTENERS_KEY] = true;
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
}

export function getDeferredInstallPrompt(): InstallPromptEvent | null {
  return deferredPrompt;
}

export function takeDeferredInstallPrompt(): InstallPromptEvent | null {
  const prompt = deferredPrompt;
  deferredPrompt = null;
  if (prompt != null) notify();
  return prompt;
}

export function isAppInstalled(): boolean {
  return installed;
}

export function subscribeInstallChange(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export async function requestAppInstall(input: {
  prompt: InstallPromptEvent | null;
  install: (() => Promise<unknown>) | null;
}): Promise<"installed" | "dismissed" | "unsupported"> {
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
