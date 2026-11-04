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
  BrowserDocumentPermissionError,
  browserDocuments,
  type BrowserOpenedDocument,
  type BrowserRecentDocument,
} from "@rubydogjp/openkk-platform-browser-adapter";

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
  const [canSaveDirectly, setCanSaveDirectly] = useState(true);

  const refreshRecent = useCallback(() => {
    browserDocuments
      .listRecent()
      .then(setRecentFiles)
      .catch(() => setRecentFiles([]));
  }, []);

  const handleClosed = useCallback(() => {
    setBook(null);
    refreshRecent();
    router.replace(ROOT_PATH);
  }, [refreshRecent, router]);

  const openWith = useCallback(
    async (pick: () => Promise<BrowserOpenedDocument | null>) => {
      setBusy(true);
      setErrorMessage(null);
      try {
        const picked = await pick();
        if (picked == null) return;
        setBook(await openBook(picked, handleClosed));
        router.replace(ROOT_PATH);
      } catch (error) {
        console.error("[openkk] document open failed:", error);
        setErrorMessage(documentErrorMessage(error));
        refreshRecent();
      } finally {
        setBusy(false);
      }
    },
    [handleClosed, refreshRecent, router],
  );

  useEffect(() => {
    setCanSaveDirectly(browserDocuments.canSaveDirectly());
    refreshRecent();
    browserDocuments.onLaunch((opening) => void openWith(() => opening));
  }, [openWith, refreshRecent]);

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
    return (
      <DocumentStartScreen
        title={START_SCREEN_TITLE}
        canSaveDirectly={canSaveDirectly}
        recentFiles={recentFiles}
        busy={busy}
        errorMessage={errorMessage}
        onCreate={() => void openWith(() => browserDocuments.create())}
        onOpen={() => void openWith(() => browserDocuments.open())}
        onOpenRecent={(id) =>
          void openWith(() => browserDocuments.openRecent(id))
        }
        onForgetRecent={(id) =>
          void browserDocuments.forgetRecent(id).then(refreshRecent)
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
  if (adapter.changedOnOpen) session.notifyChanged();
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
  if (error instanceof BrowserDocumentPermissionError) {
    return "ファイルへの書き込みが許可されませんでした。もう一度開いて、書き込みを許可してください。";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "ファイルが見つかりません。移動したか削除された可能性があります。";
  }
  return "ファイルを開けませんでした。";
}
