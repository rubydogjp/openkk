"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  OpenkkBookFileSaveResult,
  OpenkkBookFilesPort,
  OpenkkBookFileState,
  OpenkkBookFileSubject,
  OpenkkBookStorageStatus,
} from "@rubydogjp/openkk-driver";

export type OpenkkBookFile = OpenkkBookFileState & {
  save: () => Promise<OpenkkBookFileSaveResult>;
};

export type OpenkkBookStorage = {
  status: OpenkkBookStorageStatus;
  unreadableBookCount: number;
  retry: () => Promise<void>;
};

const BookFilesContext = createContext<OpenkkBookFilesPort | null>(null);

export function OpenkkBookFilesProvider(props: {
  bookFiles: OpenkkBookFilesPort | null;
  children: ReactNode;
}) {
  return (
    <BookFilesContext.Provider value={props.bookFiles}>
      {props.children}
    </BookFilesContext.Provider>
  );
}

const subscribeNothing = () => () => {};
const noState = () => null;

export function useOpenkkBookFiles(): OpenkkBookFilesPort | null {
  return useContext(BookFilesContext);
}

export function useOpenkkBookFile(
  fiscalPeriod: OpenkkBookFileSubject | null,
): OpenkkBookFile | null {
  const bookFiles = useContext(BookFilesContext);
  const saveTracking = bookFiles?.saveTracking ?? null;
  const id = fiscalPeriod?.id ?? null;
  const name = fiscalPeriod?.name ?? null;
  const createdAt = fiscalPeriod?.createdAt ?? null;
  const store = useMemo(() => {
    if (
      saveTracking == null ||
      id == null ||
      name == null ||
      createdAt == null
    ) {
      return { subscribe: subscribeNothing, getSnapshot: noState };
    }
    const subject = { id, name, createdAt };
    return {
      subscribe: (listener: () => void) => saveTracking.subscribe(listener),
      getSnapshot: () => saveTracking.getState(subject),
    };
  }, [saveTracking, createdAt, id, name]);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return useMemo(
    () =>
      bookFiles == null || id == null || state == null
        ? null
        : { ...state, save: () => bookFiles.save(id) },
    [bookFiles, id, state],
  );
}

export function useOpenkkBookStorage(): OpenkkBookStorage | null {
  const saveTracking = useContext(BookFilesContext)?.saveTracking ?? null;
  const store = useMemo(
    () =>
      saveTracking == null
        ? { subscribe: subscribeNothing, getSnapshot: noState }
        : {
            subscribe: (listener: () => void) =>
              saveTracking.subscribe(listener),
            getSnapshot: () => saveTracking.getStorageStatus(),
          },
    [saveTracking],
  );
  const status = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return useMemo(
    () =>
      saveTracking == null || status == null
        ? null
        : {
            status,
            unreadableBookCount: saveTracking.unreadableBookCount,
            retry: () => saveTracking.retryStorage(),
          },
    [saveTracking, status],
  );
}
