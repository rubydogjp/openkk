// beforeinstallprompt はページ読み込み時に一度だけ早期に発火するため、
// /install ページの useEffect で待つと取りこぼす。ここでアプリ全体として
// 早期に捕捉・保持し、各画面はこの状態を読むだけにする。
// (このモジュールを早く読み込ませるため shell から side-effect import する)

type InstallPromptEvent = Event & {
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

export function clearDeferredInstallPrompt(): void {
  deferredPrompt = null;
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
