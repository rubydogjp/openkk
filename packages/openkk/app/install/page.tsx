"use client";

import { useSyncExternalStore } from "react";

import {
  BrowserStorageInstallPage,
  InstallPage,
} from "@rubydogjp/openkk-client";

import { detectBookShelfKind } from "../book-shelf";

function subscribeToNothing(): () => void {
  return () => {};
}

export default function Page() {
  const keepsBooksInBrowser = useSyncExternalStore(
    subscribeToNothing,
    () => detectBookShelfKind() !== "folder",
    () => true,
  );
  return keepsBooksInBrowser ? <BrowserStorageInstallPage /> : <InstallPage />;
}
