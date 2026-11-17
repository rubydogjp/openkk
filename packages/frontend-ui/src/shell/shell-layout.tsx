"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  useOpenkkAppState,
  useOpenkkBookFiles,
  useMaintenance,
  useOpenkkConfig,
} from "../bindings/index.js";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  VIEWPORT_HEIGHT,
} from "../shared/design-tokens.js";
import { normalizePathname } from "../shared/pathname.js";
import {
  ShellBookSave,
  ShellBookSaveCompact,
  useShellBookSave,
} from "./book-save-button.js";
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
import { CloseIcon } from "../shared/icons.js";
import { ShellNotices } from "./shell-notices.js";
import { SHELL_PALETTE } from "./shell-palette.js";
import {
  ShellAuthActionsContext,
  useShellAuthActions,
} from "./use-shell-auth-actions.js";
import { showsEntriesSheet } from "../entries/entries-view.js";
import { usePathname, useRouter, useSearchParams } from "../routing/routing.js";

const PHONE_TAP_TARGET_SIZE = 44;

export function OpenkkShellLayout(props: { children: ReactNode }) {
  return (
    <OpenkkNoticesProvider>
      <ShellScreen>{props.children}</ShellScreen>
    </OpenkkNoticesProvider>
  );
}

function ShellScreen(props: { children: ReactNode }) {
  const pathname = normalizePathname(usePathname());
  const searchParams = useSearchParams();
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
          minHeight: VIEWPORT_HEIGHT,
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
    <ShellChrome
      pathname={pathname}
      contentMode={contentMode}
      fillsScreen={
        contentMode === "normal" && showsEntriesSheet(pathname, searchParams)
      }
    >
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
  fillsScreen,
  children,
}: {
  pathname: string;
  contentMode: Exclude<ShellContentMode, "loading">;
  fillsScreen: boolean;
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
  const tracksBookSave = useOpenkkBookFiles()?.saveTracking != null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const sidebarRef = useDismissibleLayer<HTMLElement>({
    open: drawerOpen,
    onDismiss: () => setDrawerOpen(false),
    initialFocusRef: null,
    focusOnOpen: true,
    restoreFocus: true,
    trapFocus: true,
  });

  const isNarrow = useIsNarrowScreen();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, fillsScreen, isNarrow]);

  return (
    <>
      <style>{`
        .bk-nav-item:hover { background: ${SHELL_PALETTE.navHoverBg}; }
        .bk-nav-item-active:hover { background: ${SHELL_PALETTE.navActiveBg}; }
        .bk-user-trigger:hover { background: ${SHELL_PALETTE.navHoverBg}; }
        .bk-fiscal-period-trigger:hover { background: ${SHELL_PALETTE.navHoverBg}; }
        .bk-menu-item:hover:not(:disabled) { background: ${SHELL_PALETTE.navHoverBg}; }
      `}</style>

      <div
        className="bk-mobile-topbar"
        style={fillsScreen ? { display: "none" } : {}}
      >
        <button
          type="button"
          aria-label="メニューを開く"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
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

      {drawerOpen && !fillsScreen ? (
        <div
          className="bk-shell-backdrop"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <main
        className={
          fillsScreen
            ? "bk-shell-main bk-shell-main--fills-screen"
            : "bk-shell-main"
        }
        style={{
          height: VIEWPORT_HEIGHT,
          display: "grid",
          gridTemplateColumns: fillsScreen
            ? "1fr"
            : `${sizes.shell.sidebarWidth} 1fr`,
          overflow: "hidden",
        }}
      >
        <aside
          ref={sidebarRef}
          inert={fillsScreen || (isNarrow && !drawerOpen)}
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
            display: fillsScreen ? "none" : "flex",
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
            {drawerOpen ? (
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={closeDrawer}
                style={{
                  marginLeft: "auto",
                  width: PHONE_TAP_TARGET_SIZE,
                  height: PHONE_TAP_TARGET_SIZE,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: radii.xs,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <CloseIcon size={20} color={palette.text} />
              </button>
            ) : null}
          </div>

          {tracksBookSave ? <ShellBookSave bookSave={bookSave} /> : null}

          <ShellFiscalPeriodMenu
            pathname={pathname}
            enabled={navEnabled}
            onNavigate={closeDrawer}
          />
          <ShellNav
            pathname={pathname}
            enabled={navEnabled}
            onNavigate={closeDrawer}
          />

          <div style={{ flex: 1 }} />

          <ShellAccountMenu
            pathname={pathname}
            hasSession={hasSession}
            authActionPending={auth.authActionPending}
            onSignIn={auth.signIn}
            onSignOut={auth.signOut}
            onNavigate={closeDrawer}
          />
        </aside>

        <div
          className="bk-shell-content"
          style={{
            display: "flex",
            flexDirection: "column",
            height: VIEWPORT_HEIGHT,
            overflow: "auto",
            minWidth: 0,
            background: palette.surface,
          }}
        >
          <ShellNotices
            hasSession={hasSession}
            bookFile={bookSave?.bookFile ?? null}
            onSave={bookSave?.save ?? null}
          />
          <ShellAuthActionsContext value={auth}>
            {children}
          </ShellAuthActionsContext>
        </div>
      </main>
    </>
  );
}

const NARROW_SCREEN_QUERY = "(max-width: 640px)";

function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(NARROW_SCREEN_QUERY);
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isNarrow;
}
