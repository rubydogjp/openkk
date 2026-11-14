"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  useOpenkkAppState,
  useMaintenance,
  useOpenkkConfig,
} from "../bindings/index.js";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
} from "../shared/design-tokens.js";
import { normalizePathname } from "../shared/pathname.js";
import {
  ShellBookSave,
  ShellBookSaveCompact,
  useShellBookSave,
} from "./book-save-button.js";
import { BookStorageNotice } from "./book-storage-notice.js";
import { OpenkkNoticesProvider } from "../shared/notices/notices.js";
import { useDismissibleLayer } from "../shared/dismissible-layer.js";
import { MaintenanceScreen } from "./maintenance-content.js";
import { LegacyPurgedFiscalPeriodScreen } from "../legacy/legacy-purged-fiscal-period-screen.js";
import { FiscalPeriodsContent } from "./fiscal-periods-content.js";
import { SignInContent } from "./sign-in-content.js";
import {
  LEGACY_PURGED_FISCAL_PERIOD_PATH,
  FISCAL_PERIOD_PICKER_PATH,
  resolveShellContentMode,
  shouldRedirectLegacyPurgedFiscalPeriod,
  shouldRedirectMissingFiscalPeriod,
  type ShellContentMode,
} from "./shell-content-mode.js";
import { ShellAccountMenu } from "./shell-account-menu.js";
import { ShellFiscalPeriodMenu } from "./shell-fiscal-period-menu.js";
import { ShellNav } from "./shell-nav.js";
import { ShellNotices } from "./shell-notices.js";
import { SHELL_PALETTE } from "./shell-palette.js";
import { useShellAuthActions } from "./use-shell-auth-actions.js";
import { usePathname, useRouter } from "../routing/routing.js";

export function OpenkkShellLayout(props: { children: ReactNode }) {
  return (
    <OpenkkNoticesProvider>
      <ShellScreen>{props.children}</ShellScreen>
    </OpenkkNoticesProvider>
  );
}

function ShellScreen(props: { children: ReactNode }) {
  const pathname = normalizePathname(usePathname());
  const router = useRouter();
  const appState = useOpenkkAppState();
  const maintenance = useMaintenance();
  const session = appState.session;
  const currentFiscalPeriod = appState.currentFiscalPeriod;
  const contentMode = resolveShellContentMode({
    isReady: appState.isReady,
    hasSession: session != null,
    pathname,
    currentFiscalPeriodId: appState.currentFiscalPeriodId,
    currentFiscalPeriod,
  });

  useEffect(() => {
    if (
      shouldRedirectMissingFiscalPeriod({
        isReady: appState.isReady,
        hasSession: session != null,
        pathname,
        currentFiscalPeriodId: appState.currentFiscalPeriodId,
      })
    ) {
      router.replace(FISCAL_PERIOD_PICKER_PATH);
    }
  }, [
    appState.currentFiscalPeriodId,
    appState.isReady,
    pathname,
    router,
    session,
  ]);

  useEffect(() => {
    if (
      shouldRedirectLegacyPurgedFiscalPeriod({
        isReady: appState.isReady,
        hasSession: session != null,
        pathname,
        currentFiscalPeriod,
      })
    ) {
      router.replace(LEGACY_PURGED_FISCAL_PERIOD_PATH);
    }
  }, [appState.isReady, currentFiscalPeriod, pathname, router, session]);

  if (maintenance.status?.enabled) {
    return (
      <MaintenanceScreen
        title={maintenance.status.title}
        message={maintenance.status.message}
      />
    );
  }

  if (contentMode === "loading") {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: palette.textLabel,
        }}
      >
        起動しています…
      </main>
    );
  }

  return (
    <ShellChrome pathname={pathname} contentMode={contentMode}>
      {contentMode === "sign-in" ? (
        <SignInContent />
      ) : contentMode === "fiscal-periods" ? (
        <FiscalPeriodsContent />
      ) : contentMode === "legacy-purged" && currentFiscalPeriod != null ? (
        <LegacyPurgedFiscalPeriodScreen fiscalPeriod={currentFiscalPeriod} />
      ) : (
        props.children
      )}
    </ShellChrome>
  );
}

function ShellChrome({
  pathname,
  contentMode,
  children,
}: {
  pathname: string;
  contentMode: Exclude<ShellContentMode, "loading">;
  children: ReactNode;
}) {
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const hasPeriod = appState.currentFiscalPeriodId != null;
  const navEnabled = contentMode !== "sign-in" && hasPeriod;
  const hasSession = contentMode !== "sign-in";
  const auth = useShellAuthActions();
  const bookSave = useShellBookSave(
    hasSession ? appState.currentFiscalPeriod : null,
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useDismissibleLayer<HTMLElement>({
    open: drawerOpen,
    onDismiss: () => setDrawerOpen(false),
    initialFocusRef: null,
    focusOnOpen: true,
    restoreFocus: true,
    trapFocus: true,
  });

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <style>{`
        .bk-nav-item:hover { background: ${SHELL_PALETTE.navHoverBg}; }
        .bk-nav-item-active:hover { background: ${SHELL_PALETTE.navActiveBg}; }
        .bk-user-trigger:hover { background: ${SHELL_PALETTE.navHoverBg}; }
        .bk-fiscal-period-trigger:hover { background: ${SHELL_PALETTE.navHoverBg}; }
        .bk-menu-item:hover:not(:disabled) { background: ${SHELL_PALETTE.navHoverBg}; }
      `}</style>

      <div className="bk-mobile-topbar">
        <button
          type="button"
          aria-label="メニューを開く"
          onClick={() => setDrawerOpen(true)}
          style={{
            width: sizes.button.iconOnly,
            height: sizes.button.iconOnly,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            borderRadius: radii.xs,
            padding: 0,
          }}
        >
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke={palette.text}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span
          style={{
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            color: palette.text,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          オープン会計
        </span>
        {bookSave != null ? <ShellBookSaveCompact bookSave={bookSave} /> : null}
      </div>

      {drawerOpen ? (
        <div
          className="bk-shell-backdrop"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <main
        className="bk-shell-main"
        style={{
          height: "100vh",
          display: "grid",
          gridTemplateColumns: `${sizes.shell.sidebarWidth} 1fr`,
          overflow: "hidden",
        }}
      >
        <aside
          ref={sidebarRef}
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen ? "true" : undefined}
          aria-label={drawerOpen ? "ナビゲーションメニュー" : undefined}
          tabIndex={drawerOpen ? -1 : undefined}
          className={
            drawerOpen
              ? "bk-shell-sidebar bk-shell-sidebar--open"
              : "bk-shell-sidebar"
          }
          style={{
            background: SHELL_PALETTE.sidebarBg,
            borderRight: `1px solid ${SHELL_PALETTE.sidebarBorder}`,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            width: sizes.shell.sidebarWidth,
          }}
        >
          <div
            style={{
              padding: "14px 12px 6px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px 10px",
            }}
          >
            <img
              src="/images/openkk-icon.png"
              alt=""
              width={28}
              height={28}
              style={{ display: "block", flexShrink: 0 }}
            />
            {bookSave != null ? (
              <ShellBookSave bookSave={bookSave} />
            ) : (
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.bold,
                    color: SHELL_PALETTE.titleColor,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  オープン会計
                </div>
                <div
                  style={{
                    marginTop: 1,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: SHELL_PALETTE.subtitleColor,
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {openkkConfig.bundleLabel}
                </div>
              </div>
            )}
          </div>

          <ShellFiscalPeriodMenu pathname={pathname} enabled={navEnabled} />
          <ShellNav pathname={pathname} enabled={navEnabled} />

          <div style={{ flex: 1 }} />

          <ShellAccountMenu
            pathname={pathname}
            hasSession={hasSession}
            authActionPending={auth.authActionPending}
            onSignIn={auth.signIn}
            onSignOut={auth.signOut}
          />
        </aside>

        <div
          className="bk-shell-content"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            overflow: "auto",
            minWidth: 0,
            background: palette.surface,
          }}
        >
          <ShellNotices
            bookFile={bookSave?.bookFile ?? null}
            onSave={bookSave?.save ?? null}
          />
          {children}
        </div>
      </main>
      {hasSession ? <BookStorageNotice /> : null}
    </>
  );
}
