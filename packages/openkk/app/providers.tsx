"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  createOpenkkDocumentSession,
  DocumentStartScreen,
  type BrandConfig,
  type OpenkkDocumentSession,
  type OpenkkNextBookInput,
  type OpenkkOtherBookPeriod,
} from "@rubydogjp/openkk-client";
import {
  OpenkkAppProviders,
  OpenkkStartProviders,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-frontend";
import {
  createDocumentDbAdapter,
  DocumentFileFormatError,
} from "@rubydogjp/openkk-document-db-adapter";
import {
  BookFolderMissingError,
  BookInUseError,
  BrowserDocumentPermissionError,
  browserDocuments,
  folderBooks,
  NEW_OPENKK_DOCUMENT_NAME,
  type BrowserOpenedDocument,
  type BrowserRecentDocument,
} from "@rubydogjp/openkk-platform-browser-adapter";

import {
  buildNextBookBytes,
  createBookBackend,
  findLatestFiscalPeriod,
} from "./book-backend";
import {
  bookPlace,
  canReachBooks,
  copyOutsideFileIntoApp,
  createShelfBook,
  detectBookShelfKind,
  emptyBookShelf,
  forgetLastBook,
  loadBookShelf,
  openShelfBook,
  readLastBook,
  readOtherBookPeriods,
  rememberLastBook,
  removeShelfBook,
  type BookShelfKind,
  type BookShelfState,
} from "./book-shelf";
import { LEGACY_BOOK_NAME, legacyBook } from "./legacy-book";
import { buildBookConfig, START_CONFIG } from "./openkk-config";

const brandConfig: BrandConfig = {
  marketingSiteUrl: null,
  productSiteUrl: null,
  accountIconUrl: null,
};

const START_SCREEN_TITLE = "オープン会計";
const ROOT_PATH = "/";
const INSTALL_PATH = "/install";

const LEGACY_BOOK_PENDING_NOTICE = `これまでこのブラウザで付けていた帳簿は、帳簿を置くフォルダが決まると、そこへ「${LEGACY_BOOK_NAME}」として移します。`;
const LEGACY_BOOK_WAITING_NOTICE =
  "前の版のオープン会計が別のタブで開いています。そのタブを閉じると、これまでの帳簿をこちらへ移します。";
const LEGACY_BOOK_MOVE_FAILED =
  "これまでこのブラウザで付けていた帳簿を移せませんでした。ページを読み込み直すと、もう一度移します。";

type OpenedBook = {
  key: number;
  runtime: OpenkkBundleRuntime;
  session: OpenkkDocumentSession;
};

type BookEvents = {
  closed(session: OpenkkDocumentSession): void;
  nextBook(
    session: OpenkkDocumentSession,
    input: OpenkkNextBookInput,
  ): Promise<void>;
  otherBookPeriods(currentName: string): Promise<OpenkkOtherBookPeriod[]>;
};

type OpenOptions = {
  saveOnOpen: boolean;
  shelfKind: BookShelfKind | null;
  reopening: boolean;
};

type ShelfRefresh = { shelf: BookShelfState; movedBook: string | null };

type Reopen = "none" | "moved" | "moved_or_last";

let nextBookKey = 1;

function isInstallPath(pathname: string): boolean {
  return pathname.replace(/\/$/, "") === INSTALL_PATH;
}

function rememberShelfBook(kind: BookShelfKind, name: string): void {
  if (bookPlace(kind) == null) forgetLastBook();
  else rememberLastBook(kind, name);
}

export function Providers(props: { children: ReactNode }) {
  const router = useRouter();
  const onInstallPage = isInstallPath(usePathname());
  const [book, setBook] = useState<OpenedBook | null>(null);
  const openedSession = useRef<OpenkkDocumentSession | null>(null);
  const launching = useRef(false);
  const bootStarted = useRef(false);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<BrowserRecentDocument[]>([]);
  const [shelf, setShelf] = useState<BookShelfState | null>(null);
  const shelfKind = shelf?.kind ?? null;

  const showBook = useCallback((opened: OpenedBook) => {
    openedSession.current = opened.session;
    setBook(opened);
  }, []);

  const refreshShelf = useCallback(
    async (kind: BookShelfKind): Promise<ShelfRefresh> => {
      const load = () =>
        loadBookShelf(kind).catch((error: unknown) => {
          console.error("[openkk] book list failed:", error);
          setErrorMessage(documentErrorMessage(error));
          return emptyBookShelf(kind);
        });
      let loaded = await load();
      setShelf(loaded);
      let movedBook: string | null = null;
      const place = bookPlace(loaded.kind);
      if (place != null && canReachBooks(loaded.place)) {
        movedBook = await legacyBook
          .moveInto(place, () => setNotice(LEGACY_BOOK_WAITING_NOTICE))
          .catch((error: unknown) => {
            console.error("[openkk] legacy book move failed:", error);
            setErrorMessage(LEGACY_BOOK_MOVE_FAILED);
            return null;
          });
        if (movedBook != null) {
          rememberLastBook(loaded.kind, movedBook);
          loaded = await load();
        }
      }
      const legacyBookPending =
        !canReachBooks(loaded.place) &&
        (await legacyBook.hasBookToMove().catch(() => false));
      setNotice(legacyBookPending ? LEGACY_BOOK_PENDING_NOTICE : null);
      setShelf(loaded);
      setRecentFiles(await browserDocuments.listRecent());
      return { shelf: loaded, movedBook };
    },
    [],
  );

  const bookEvents = useMemo((): BookEvents => {
    const kind = shelfKind ?? detectBookShelfKind();
    const events: BookEvents = {
      closed(session) {
        if (openedSession.current === session) {
          openedSession.current = null;
          forgetLastBook();
          setBook(null);
        }
        void refreshShelf(kind);
        router.replace(ROOT_PATH);
      },
      async nextBook(session, input) {
        await session.save();
        if (session.getStatus() !== "saved") {
          throw new Error("the current book could not be saved");
        }
        const bytes = await buildNextBookBytes(input);
        const created = await createShelfBook(kind, input.fileName);
        showBook(await openBook({ ...created, bytes }, true, events));
        rememberShelfBook(kind, created.sink.fileName);
        await session.close();
      },
      otherBookPeriods: (currentName) =>
        readOtherBookPeriods(kind, currentName),
    };
    return events;
  }, [refreshShelf, router, shelfKind, showBook]);

  const openWith = useCallback(
    async (
      pick: () => Promise<BrowserOpenedDocument | null>,
      options: OpenOptions,
    ) => {
      setBusy(true);
      setErrorMessage(null);
      try {
        const picked = await pick();
        if (picked == null) return;
        showBook(await openBook(picked, options.saveOnOpen, bookEvents));
        if (options.shelfKind == null) forgetLastBook();
        else rememberShelfBook(options.shelfKind, picked.sink.fileName);
        if (!options.reopening) router.replace(ROOT_PATH);
      } catch (error) {
        console.error("[openkk] document open failed:", error);
        setErrorMessage(documentErrorMessage(error));
        if (options.reopening && !(error instanceof BookInUseError)) {
          forgetLastBook();
        }
        if (shelfKind != null) void refreshShelf(shelfKind);
      } finally {
        setBusy(false);
      }
    },
    [bookEvents, refreshShelf, router, shelfKind, showBook],
  );

  const reopenBook = useCallback(
    async (refreshed: ShelfRefresh, reopen: Reopen) => {
      if (reopen === "none") return;
      if (openedSession.current != null || launching.current) return;
      const { shelf: loaded, movedBook } = refreshed;
      const name =
        movedBook ??
        (reopen === "moved_or_last" ? readLastBook(loaded.kind) : null);
      if (name == null || !loaded.books.some((stored) => stored.name === name))
        return;
      await openWith(() => openShelfBook(loaded.kind, name), {
        saveOnOpen: false,
        shelfKind: loaded.kind,
        reopening: true,
      });
    },
    [openWith],
  );

  const runOnShelf = useCallback(
    async (action: () => Promise<unknown>, reopen: Reopen) => {
      if (shelfKind == null) return;
      setBusy(true);
      setErrorMessage(null);
      try {
        await action();
      } catch (error) {
        console.error("[openkk] book shelf action failed:", error);
        setErrorMessage(documentErrorMessage(error));
      }
      const refreshed = await refreshShelf(shelfKind);
      setBusy(false);
      await reopenBook(refreshed, reopen);
    },
    [refreshShelf, reopenBook, shelfKind],
  );

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    const reopen: Reopen = onInstallPage ? "none" : "moved_or_last";
    void (async () => {
      const refreshed = await refreshShelf(detectBookShelfKind());
      await reopenBook(refreshed, reopen);
      setBooting(false);
    })();
  }, [onInstallPage, refreshShelf, reopenBook]);

  useEffect(() => {
    browserDocuments.onLaunch((opening) => {
      launching.current = true;
      void openWith(() => opening, {
        saveOnOpen: false,
        shelfKind: null,
        reopening: false,
      });
    });
  }, [openWith]);

  useEffect(() => {
    if (book == null) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (book.session.getStatus() === "saved") return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [book]);

  if (book != null) {
    return (
      <OpenkkAppProviders key={book.key} runtime={book.runtime}>
        {props.children}
      </OpenkkAppProviders>
    );
  }

  if (onInstallPage) {
    return (
      <OpenkkStartProviders
        config={START_CONFIG}
        brandConfig={brandConfig}
        registerServiceWorker
      >
        {props.children}
      </OpenkkStartProviders>
    );
  }

  if (shelf == null || (booting && notice == null)) return null;

  return (
    <OpenkkStartProviders
      config={START_CONFIG}
      brandConfig={brandConfig}
      registerServiceWorker
    >
      <DocumentStartScreen
        title={START_SCREEN_TITLE}
        place={shelf.place}
        books={shelf.books}
        recentFiles={recentFiles}
        busy={busy || booting}
        notice={notice}
        errorMessage={errorMessage}
        onChooseFolder={() =>
          void runOnShelf(() => folderBooks.chooseFolder(), "moved")
        }
        onRequestFolderAccess={() =>
          void runOnShelf(() => folderBooks.requestAccess(), "moved_or_last")
        }
        onCreate={() =>
          void openWith(
            () => createShelfBook(shelf.kind, NEW_OPENKK_DOCUMENT_NAME),
            { saveOnOpen: false, shelfKind: shelf.kind, reopening: false },
          )
        }
        onOpen={() =>
          shelf.kind === "in_app"
            ? void openWith(copyOutsideFileIntoApp, {
                saveOnOpen: true,
                shelfKind: shelf.kind,
                reopening: false,
              })
            : void openWith(() => browserDocuments.open(), {
                saveOnOpen: false,
                shelfKind: null,
                reopening: false,
              })
        }
        onOpenBook={(name) =>
          void openWith(() => openShelfBook(shelf.kind, name), {
            saveOnOpen: false,
            shelfKind: shelf.kind,
            reopening: false,
          })
        }
        onRemoveBook={(name) =>
          void runOnShelf(() => removeShelfBook(shelf.kind, name), "none")
        }
        onOpenRecent={(id) =>
          void openWith(() => browserDocuments.openRecent(id), {
            saveOnOpen: false,
            shelfKind: null,
            reopening: false,
          })
        }
        onForgetRecent={(id) =>
          void runOnShelf(() => browserDocuments.forgetRecent(id), "none")
        }
      />
    </OpenkkStartProviders>
  );
}

async function openBook(
  picked: BrowserOpenedDocument,
  saveOnOpen: boolean,
  events: BookEvents,
): Promise<OpenedBook> {
  try {
    return await openPickedBook(picked, saveOnOpen, events);
  } catch (error) {
    picked.release();
    throw error;
  }
}

async function openPickedBook(
  picked: BrowserOpenedDocument,
  saveOnOpen: boolean,
  events: BookEvents,
): Promise<OpenedBook> {
  const adapter = await createDocumentDbAdapter(picked.bytes);
  const session: OpenkkDocumentSession = createOpenkkDocumentSession({
    sink: picked.sink,
    exportBytes: adapter.exportBytes,
    onClose: () => {
      adapter.close();
      picked.release();
      events.closed(session);
    },
    openNextBook: (input) => events.nextBook(session, input),
    readOtherBookPeriods: () => events.otherBookPeriods(picked.sink.fileName),
    backup: picked.backup,
    now: () => Date.now(),
  });
  adapter.onChange(() => session.notifyChanged());
  if (saveOnOpen || adapter.changedOnOpen) session.notifyChanged();
  await picked.remember();
  const backend = createBookBackend(adapter.db);
  const latestPeriod = await findLatestFiscalPeriod(backend);
  return {
    key: nextBookKey++,
    session,
    runtime: {
      config: buildBookConfig(picked.sink.fileName, latestPeriod?.id ?? null),
      brandConfig,
      calloutSlots: {
        stepJournalizingPreClosingHint: null,
        stepNextFiscalPeriodFooter: null,
      },
      createBackendApi: async () => backend,
      registerServiceWorker: true,
      document: session,
    },
  };
}

function documentErrorMessage(error: unknown): string {
  if (error instanceof DocumentFileFormatError) {
    return error.problem === "newer_schema"
      ? "このファイルは新しい版のオープン会計で作られています。アプリを更新してから開いてください。"
      : "このファイルはオープン会計の帳簿ではありません。";
  }
  if (error instanceof BookInUseError) {
    return `「${error.bookName}」は別のタブで開いています。そのタブを閉じてから、もう一度開いてください。`;
  }
  if (error instanceof BookFolderMissingError) {
    return "帳簿を置くフォルダを選んでください。";
  }
  if (error instanceof BrowserDocumentPermissionError) {
    return "ファイルへの書き込みが許可されませんでした。もう一度開いて、書き込みを許可してください。";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "ファイルが見つかりません。移動したか削除された可能性があります。";
  }
  return "ファイルを開けませんでした。";
}
