"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  OpenkkDocumentPort,
  OpenkkDocumentSaveMode,
  OpenkkDocumentSaveStatus,
  OpenkkNextBookInput,
} from "@rubydogjp/openkk-client-ports";

export type OpenkkDocumentState = {
  fileName: string;
  saveMode: OpenkkDocumentSaveMode;
  status: OpenkkDocumentSaveStatus;
  save: () => Promise<void>;
  close: () => Promise<void>;
  openNextBook: (input: OpenkkNextBookInput) => Promise<void>;
};

const DocumentContext = createContext<OpenkkDocumentPort | null>(null);

export function OpenkkDocumentProvider(props: {
  document: OpenkkDocumentPort | null;
  children: ReactNode;
}) {
  return (
    <DocumentContext.Provider value={props.document}>
      {props.children}
    </DocumentContext.Provider>
  );
}

const subscribeNothing = () => () => {};
const noStatus = () => null;

export function useOpenkkDocument(): OpenkkDocumentState | null {
  const document = useContext(DocumentContext);
  const store = useMemo(
    () =>
      document == null
        ? { subscribe: subscribeNothing, getSnapshot: noStatus }
        : {
            subscribe: (listener: () => void) => document.subscribe(listener),
            getSnapshot: () => document.getStatus(),
          },
    [document],
  );
  const status = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  if (document == null || status == null) return null;
  return {
    fileName: document.fileName,
    saveMode: document.saveMode,
    status,
    save: () => document.save(),
    close: () => document.close(),
    openNextBook: (input) => document.openNextBook(input),
  };
}
