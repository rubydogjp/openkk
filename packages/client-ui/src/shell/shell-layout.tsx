"use client";

import { usePathname, useRouter } from "next/navigation.js";
import { useEffect, useState, type ReactNode } from "react";

import {
  useOpenkkAppState,
  useMaintenance,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
} from "../shared/design-tokens.js";
import { normalizePathname } from "../shared/pathname.js";
import "../shared/pwa-install.js";
import { DataLoadErrorBanner } from "./data-load-error-banner.js";
import { AppErrorText } from "../shared/app-error-text.js";
import { useDismissibleLayer } from "../shared/dismissible-layer.js";
import { MaintenanceScreen } from "./maintenance-content.js";
import { ArchivedFiscalPeriodScreen } from "../routes/steps/archived-fiscal-period-screen.js";
import { FiscalPeriodsContent } from "./fiscal-periods-content.js";
import { SignInContent } from "./sign-in-content.js";
import {
  ARCHIVED_WORKSPACE_PATH,
  FISCAL_PERIOD_PICKER_PATH,
  resolveShellContentMode,
  shouldRedirectArchivedWorkspace,
  shouldRedirectMissingFiscalPeriod,
  type ShellContentMode,
} from "./shell-content-mode.js";
import { ShellAccountMenu } from "./shell-account-menu.js";
import { ShellFiscalPeriodMenu } from "./shell-fiscal-period-menu.js";
import { ShellNav } from "./shell-nav.js";
import {
  SHELL_PALETTE as PALETTE,
  SHELL_SIDEBAR_WIDTH as SIDEBAR_WIDTH,
} from "./shell-palette.js";
import { useShellAuthActions } from "./use-shell-auth-actions.js";

export function OpenkkShellLayout(props: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname());
  const router = useRouter();
  const appState = useOpenkkAppState();
  const maintenance = useMaintenance();
  const session = appState.session;
  const currentFiscalPeriod =
    appState.fiscalPeriods.find(
      (p) => p.id === appState.currentFiscalPeriodId,
    ) ?? null;
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
      shouldRedirectArchivedWorkspace({
        isReady: appState.isReady,
        hasSession: session != null,
        pathname,
        currentFiscalPeriod,
      })
    ) {
      router.replace(ARCHIVED_WORKSPACE_PATH);
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
      ) : contentMode === "archived" && currentFiscalPeriod != null ? (
        <ArchivedFiscalPeriodScreen fiscalPeriod={currentFiscalPeriod} />
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
  const hasPeriod =
    appState.currentFiscalPeriodId != null &&
    appState.currentFiscalPeriodId !== "";
  const navEnabled = contentMode !== "sign-in" && hasPeriod;
  const hasSession = contentMode !== "sign-in";
  const auth = useShellAuthActions();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useDismissibleLayer<HTMLElement>({
    open: drawerOpen,
    onDismiss: () => setDrawerOpen(false),
    trapFocus: true,
    initialFocusRef: null,
    focusOnOpen: true,
    restoreFocus: true,
  });

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <style>{`
        .bk-nav-item:hover { background: ${PALETTE.navHoverBg}; }
        .bk-nav-item-active:hover { background: ${PALETTE.navActiveBg}; }
        .bk-user-trigger:hover { background: ${PALETTE.navHoverBg}; }
        .bk-ws-trigger:hover { background: ${PALETTE.navHoverBg}; }
        .bk-menu-item:hover:not(:disabled) { background: ${PALETTE.navHoverBg}; }
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
          }}
        >
          オープン会計
        </span>
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
          gridTemplateColumns: `${SIDEBAR_WIDTH} 1fr`,
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
            background: PALETTE.sidebarBg,
            borderRight: `1px solid ${PALETTE.sidebarBorder}`,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            width: SIDEBAR_WIDTH,
          }}
        >
          <div
            style={{
              padding: "14px 12px 6px",
              display: "flex",
              alignItems: "center",
              gap: 10,
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
                  color: PALETTE.titleColor,
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
                  color: PALETTE.subtitleColor,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {openkkConfig.bundleLabel}
              </div>
            </div>
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
          {auth.authActionError != null ? (
            <div
              role="alert"
              style={{
                padding: "10px 16px",
                background: palette.dangerBg,
                borderBottom: `1px solid ${palette.dangerBorder}`,
              }}
            >
              <AppErrorText error={auth.authActionError} style={null} fallbackUserMessage={null} />
            </div>
          ) : null}
          <DataLoadErrorBanner />
          {children}
        </div>
      </main>
    </>
  );
}
