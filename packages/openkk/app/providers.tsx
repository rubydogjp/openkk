"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { createBookFilesAdapter } from "@rubydogjp/openkk-book-files-adapter";
import { createBooksDbAdapter } from "@rubydogjp/openkk-books-db-adapter";
import type { BrandConfig } from "@rubydogjp/openkk-client";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import {
  OpenkkAppProviders,
  OpenkkStartProviders,
  type OpenkkBootEvents,
  type OpenkkBundleBackend,
  type OpenkkBundleRuntime,
} from "@rubydogjp/openkk-frontend";
import {
  bookFileName,
  browserAppLock,
  deliverBookFile,
  inAppBookStore,
  newInAppBookName,
  platformBrowserAdapter,
  requestBrowserPersistentStorage,
} from "@rubydogjp/openkk-platform-browser-adapter";

import { legacyBook } from "./legacy-book";
import { openkkConfig } from "./openkk-config";

const brandConfig: BrandConfig = {
  marketingSiteUrl: null,
  productSiteUrl: null,
  accountIconUrl: null,
};

const BOOKS_LOCK_NAME = "openkk-books";
const INSTALL_PATH = "/install";

type BooksBoot = {
  backend: Promise<OpenkkBundleBackend>;
  waitingForAnotherTab: boolean;
  onWaitingForAnotherTab: () => void;
};

let booksBoot: BooksBoot | null = null;
let booksLock: Promise<unknown> | null = null;

function holdBooksLock(onWaitingForAnotherTab: () => void): Promise<unknown> {
  if (booksLock != null) return booksLock;
  const held = browserAppLock
    .hold(BOOKS_LOCK_NAME, onWaitingForAnotherTab)
    .catch((error: unknown) => {
      if (booksLock === held) booksLock = null;
      throw error;
    });
  booksLock = held;
  return held;
}

const runtime: OpenkkBundleRuntime = {
  config: openkkConfig,
  brandConfig,
  calloutSlots: {
    stepJournalizingPreClosingHint: null,
    stepNextFiscalPeriodFooter: null,
  },
  createBackend: createBooksBackend,
  registerServiceWorker: true,
};

function isInstallPath(pathname: string): boolean {
  return pathname.replace(/\/$/, "") === INSTALL_PATH;
}

export function Providers(props: { children: ReactNode }) {
  if (isInstallPath(usePathname())) {
    return (
      <OpenkkStartProviders
        config={openkkConfig}
        brandConfig={brandConfig}
        registerServiceWorker
      >
        {props.children}
      </OpenkkStartProviders>
    );
  }
  return (
    <OpenkkAppProviders runtime={runtime}>{props.children}</OpenkkAppProviders>
  );
}

function createBooksBackend(
  events: OpenkkBootEvents,
): Promise<OpenkkBundleBackend> {
  if (booksBoot != null) {
    booksBoot.onWaitingForAnotherTab = events.onWaitingForAnotherTab;
    if (booksBoot.waitingForAnotherTab) events.onWaitingForAnotherTab();
    return booksBoot.backend;
  }
  const boot: BooksBoot = {
    waitingForAnotherTab: false,
    onWaitingForAnotherTab: events.onWaitingForAnotherTab,
    backend: openBooksBackend(() => {
      boot.waitingForAnotherTab = true;
      boot.onWaitingForAnotherTab();
    }).catch((error: unknown) => {
      if (booksBoot === boot) booksBoot = null;
      throw error;
    }),
  };
  booksBoot = boot;
  return boot.backend;
}

async function openBooksBackend(
  onWaitingForAnotherTab: () => void,
): Promise<OpenkkBundleBackend> {
  const userId = openkkConfig.embeddedUser.id;
  await holdBooksLock(onWaitingForAnotherTab);
  void requestBrowserPersistentStorage();
  await legacyBook.moveInto(inAppBookStore, onWaitingForAnotherTab);
  const forgottenFiscalPeriodIds: string[] = [];
  let forgetFiscalPeriod = (fiscalPeriodId: string) => {
    forgottenFiscalPeriodIds.push(fiscalPeriodId);
  };
  const books = await createBooksDbAdapter({
    store: inAppBookStore,
    newBookName: newInAppBookName,
    onFiscalPeriodRemoved: (fiscalPeriodId) =>
      forgetFiscalPeriod(fiscalPeriodId),
    onSaveError: (error) => {
      console.error("[openkk] book could not be stored:", error);
    },
  });
  const bookFiles = createBookFilesAdapter({
    books,
    userId,
    storage: platformBrowserAdapter.storage,
    now: () => Date.now(),
    fileNameOf: bookFileName,
    deliver: deliverBookFile,
  });
  forgetFiscalPeriod = bookFiles.forgetFiscalPeriod;
  forgottenFiscalPeriodIds.forEach(forgetFiscalPeriod);
  return {
    api: createOpenkkEmbeddedBackendAdapter(
      createOpenkkEmbeddedBackend(books.db, { userId }),
    ),
    bookFiles,
  };
}
