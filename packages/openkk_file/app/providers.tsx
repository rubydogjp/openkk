"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  createOpenkkDocumentSession,
  DocumentStartScreen,
  type BrandConfig,
  type OpenkkDocumentSession,
} from "@rubydogjp/openkk-client";
import {
  OpenkkAppProviders,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-frontend";
import {
  createDocumentDbAdapter,
  DocumentFileFormatError,
} from "@rubydogjp/openkk-document-db-adapter";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import {
  BookFolderMissingError,
  BrowserDocumentPermissionError,
  browserDocuments,
  folderBooks,
  NEW_OPENKK_DOCUMENT_NAME,
  type BrowserOpenedDocument,
  type BrowserRecentDocument,
} from "@rubydogjp/openkk-platform-browser-adapter";

import {
  copyOutsideFileIntoApp,
  createShelfBook,
  detectBookShelfKind,
  emptyBookShelf,
  loadBookShelf,
  openShelfBook,
  removeShelfBook,
  type BookShelfKind,
  type BookShelfState,
} from "./book-shelf";
import {
  BOOK_OWNER_USER_ID,
  BUNDLE_LABEL,
  buildDocumentConfig,
} from "./openkk-config";

const brandConfig: BrandConfig = {
  marketingSiteUrl: null,
  productSiteUrl: null,
  accountIconUrl: null,
};

const START_SCREEN_TITLE = `オープン会計 ${BUNDLE_LABEL}`;
const ROOT_PATH = "/";

type OpenedBook = {
  key: number;
  runtime: OpenkkBundleRuntime;
  session: OpenkkDocumentSession;
};

let nextBookKey = 1;

export function Providers(props: { children: ReactNode }) {
  const router = useRouter();
  const [book, setBook] = useState<OpenedBook | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<BrowserRecentDocument[]>([]);
  const [shelf, setShelf] = useState<BookShelfState | null>(null);
  const shelfKind = shelf?.kind ?? null;

  const refreshShelf = useCallback(async (kind: BookShelfKind) => {
    const [loaded, recent] = await Promise.all([
      loadBookShelf(kind).catch((error: unknown) => {
        console.error("[openkk] book list failed:", error);
        setErrorMessage(documentErrorMessage(error));
        return emptyBookShelf(kind);
      }),
      browserDocuments.listRecent(),
    ]);
    setShelf(loaded);
    setRecentFiles(recent);
  }, []);

  const handleClosed = useCallback(() => {
    setBook(null);
    if (shelfKind != null) void refreshShelf(shelfKind);
    router.replace(ROOT_PATH);
  }, [refreshShelf, router, shelfKind]);

  const openWith = useCallback(
    async (
      pick: () => Promise<BrowserOpenedDocument | null>,
      saveOnOpen: boolean,
    ) => {
      setBusy(true);
      setErrorMessage(null);
      try {
        const picked = await pick();
        if (picked == null) return;
        setBook(await openBook(picked, saveOnOpen, handleClosed));
        router.replace(ROOT_PATH);
      } catch (error) {
        console.error("[openkk] document open failed:", error);
        setErrorMessage(documentErrorMessage(error));
        if (shelfKind != null) void refreshShelf(shelfKind);
      } finally {
        setBusy(false);
      }
    },
    [handleClosed, refreshShelf, router, shelfKind],
  );

  const runOnShelf = useCallback(
    async (action: () => Promise<unknown>) => {
      if (shelfKind == null) return;
      setBusy(true);
      setErrorMessage(null);
      try {
        await action();
      } catch (error) {
        console.error("[openkk] book shelf action failed:", error);
        setErrorMessage(documentErrorMessage(error));
      } finally {
        await refreshShelf(shelfKind);
        setBusy(false);
      }
    },
    [refreshShelf, shelfKind],
  );

  useEffect(() => {
    void refreshShelf(detectBookShelfKind());
  }, [refreshShelf]);

  useEffect(() => {
    browserDocuments.onLaunch((opening) => void openWith(() => opening, false));
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

  if (book == null) {
    if (shelf == null) return null;
    return (
      <DocumentStartScreen
        title={START_SCREEN_TITLE}
        place={shelf.place}
        books={shelf.books}
        recentFiles={recentFiles}
        busy={busy}
        errorMessage={errorMessage}
        onChooseFolder={() => void runOnShelf(() => folderBooks.chooseFolder())}
        onRequestFolderAccess={() =>
          void runOnShelf(() => folderBooks.requestAccess())
        }
        onCreate={() =>
          void openWith(
            () => createShelfBook(shelf.kind, NEW_OPENKK_DOCUMENT_NAME),
            false,
          )
        }
        onOpen={() =>
          shelf.kind === "in_app"
            ? void openWith(copyOutsideFileIntoApp, true)
            : void openWith(() => browserDocuments.open(), false)
        }
        onOpenBook={(name) =>
          void openWith(() => openShelfBook(shelf.kind, name), false)
        }
        onRemoveBook={(name) =>
          void runOnShelf(() => removeShelfBook(shelf.kind, name))
        }
        onOpenRecent={(id) =>
          void openWith(() => browserDocuments.openRecent(id), false)
        }
        onForgetRecent={(id) =>
          void runOnShelf(() => browserDocuments.forgetRecent(id))
        }
      />
    );
  }

  return (
    <OpenkkAppProviders key={book.key} runtime={book.runtime}>
      {props.children}
    </OpenkkAppProviders>
  );
}

async function openBook(
  picked: BrowserOpenedDocument,
  saveOnOpen: boolean,
  onClosed: () => void,
): Promise<OpenedBook> {
  const adapter = await createDocumentDbAdapter(picked.bytes);
  const session = createOpenkkDocumentSession({
    sink: picked.sink,
    exportBytes: adapter.exportBytes,
    onClose: () => {
      adapter.close();
      onClosed();
    },
  });
  adapter.onChange(() => session.notifyChanged());
  if (saveOnOpen || adapter.changedOnOpen) session.notifyChanged();
  await picked.remember();
  const backend = createOpenkkEmbeddedBackendAdapter(
    createOpenkkEmbeddedBackend(adapter.db, { userId: BOOK_OWNER_USER_ID }),
  );
  return {
    key: nextBookKey++,
    session,
    runtime: {
      config: buildDocumentConfig(picked.sink.fileName),
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
