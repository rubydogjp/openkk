export type PlatformAppInstallState = "installed" | "available" | "unavailable";

export type PlatformAppInstallOutcome = "installed" | "dismissed" | "unsupported";

export interface PlatformAppInstall {
  getState(): PlatformAppInstallState;
  subscribe(listener: () => void): () => void;
  request(): Promise<PlatformAppInstallOutcome>;
}

export interface PlatformOfflineCache {
  register(scriptUrl: string, version: string): void;
}

export interface PlatformKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlatformFiles {
  save(bytes: Uint8Array, filename: string, mimeType: string): void;
}

export interface PlatformNavigation {
  appUrl(path: string): string;
  openExternal(url: string): void;
  leaveTo(url: string): void;
  reloadAt(path: string): void;
}

export interface PlatformClipboard {
  writeText(text: string): Promise<void>;
}

export interface PlatformPort {
  appInstall: PlatformAppInstall;
  offlineCache: PlatformOfflineCache;
  storage: PlatformKeyValueStorage;
  files: PlatformFiles;
  navigation: PlatformNavigation;
  clipboard: PlatformClipboard;
}
