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
  OpenkkOtherBookPeriod,
} from "@rubydogjp/openkk-client-ports";

export type OpenkkDocumentBackupState = {
  lastSavedAt: number | null;
  due: boolean;
  save: () => Promise<void>;
};

export type OpenkkDocumentState = {
  fileName: string;
  saveMode: OpenkkDocumentSaveMode;
  status: OpenkkDocumentSaveStatus;
  save: () => Promise<void>;
  close: () => Promise<void>;
  openNextBook: (input: OpenkkNextBookInput) => Promise<void>;
  backup: OpenkkDocumentBackupState | null;
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
const noLastSavedAt = () => null;
const notDue = () => false;

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
  const backup = document?.backup ?? null;
  const readLastSavedAt = useMemo(
    () => (backup == null ? noLastSavedAt : () => backup.getLastSavedAt()),
    [backup],
  );
  const readDue = useMemo(
    () => (backup == null ? notDue : () => backup.isDue()),
    [backup],
  );
  const lastSavedAt = useSyncExternalStore(
    store.subscribe,
    readLastSavedAt,
    readLastSavedAt,
  );
  const due = useSyncExternalStore(store.subscribe, readDue, readDue);
  if (document == null || status == null) return null;
  return {
    fileName: document.fileName,
    saveMode: document.saveMode,
    status,
    save: () => document.save(),
    close: () => document.close(),
    openNextBook: (input) => document.openNextBook(input),
    backup:
      backup == null ? null : { lastSavedAt, due, save: () => backup.save() },
  };
}

export function useOtherBookPeriodsReader():
  (() => Promise<OpenkkOtherBookPeriod[]>) | null {
  const document = useContext(DocumentContext);
  return useMemo(
    () => (document == null ? null : () => document.readOtherBookPeriods()),
    [document],
  );
}
