"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  useOpenkkAppState,
  useBrandConfig,
  useMaintenance,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import {
  AppError,
  userCanSignOut,
  userEmail,
} from "@rubydogjp/openkk-client-domain";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  spacing,
  typography,
} from "../shared/design-tokens.js";
import { normalizePathname } from "../shared/pathname.js";
import "../shared/pwa-install.js";
import { DataLoadErrorBanner } from "./data-load-error-banner.js";
import { AppErrorText } from "../shared/app-error-text.js";
import {
  useDismissibleLayer,
  usePopoverLifecycle,
} from "../shared/dismissible-layer.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import { openExternalUrl } from "../shared/external-navigation.js";
import { MaintenanceScreen } from "./maintenance-content.js";
import { ArchivedFiscalPeriodScreen } from "../routes/steps/archived-fiscal-period-screen.js";
import { FiscalPeriodsContent } from "./fiscal-periods-content.js";
import { SignInContent } from "./sign-in-content.js";
import {
  AssistIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  JournalIcon,
  LoginIcon,
  LogoutIcon,
  PersonIcon,
  StepsIcon,
} from "./shell-icons.js";
import {
  ARCHIVED_WORKSPACE_PATH,
  FISCAL_PERIOD_PICKER_PATH,
  resolveShellContentMode,
  shouldRedirectArchivedWorkspace,
  shouldRedirectMissingFiscalPeriod,
  type ShellContentMode,
} from "./shell-content-mode.js";

const PALETTE = {
  sidebarBg: palette.chromeSurface,

  sidebarBorder: palette.borderHeavy,
  brandGradient: `linear-gradient(135deg, ${palette.brandInk} 0%, #334155 100%)`,
  brandFg: palette.surface,
  titleColor: palette.text,
  subtitleColor: palette.textLabel,
  navText: palette.textSoft,
  navIcon: palette.textLabel,
  navIconActive: palette.textSoft,
  navActiveBg: palette.surfaceTint ?? palette.hoverSubtle,
  navActiveText: palette.text,
  navHoverBg: palette.hoverSubtle,
  userAvatarBg: palette.textSoft,
  menuDanger: palette.danger,
  menuLink: palette.action,
  menuTextActive: palette.textSoft,
  menuTextDisabled: palette.textMuted,
  menuIconActive: palette.textLabel,
  menuIconDisabled: palette.textMuted,
  menuDivider: palette.borderSubtle,
  menuBorder: palette.borderSubtle,
};

const SIDEBAR_WIDTH = sizes.shell.sidebarWidth;

type NavEntry = {
  href: string;
  label: string;
  Icon: (props: { size: number; color: string }) => ReactNode;
};

const navItems: NavEntry[] = [
  { href: "/steps", label: "手順", Icon: StepsIcon },
  { href: "/entries", label: "仕訳", Icon: JournalIcon },
  { href: "/assist", label: "補助", Icon: AssistIcon },
];

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
    <ShellChrome pathname={pathname} router={router} contentMode={contentMode}>
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
  router,
  contentMode,
  children,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
  contentMode: Exclude<ShellContentMode, "loading">;
  children: ReactNode;
}) {
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const brandConfig = useBrandConfig();
  const session = appState.session;
  const hasPeriod =
    appState.currentFiscalPeriodId != null &&
    appState.currentFiscalPeriodId !== "";

  const navEnabled = contentMode !== "sign-in" && hasPeriod;
  const workspaceEnabled = navEnabled;
  const hasSession = contentMode !== "sign-in";

  const [menuOpen, setMenuOpen] = useState(false);
  const { containerRef: accountMenuContainerRef, popupRef: menuRef } =
    usePopoverLifecycle<HTMLDivElement, HTMLDivElement>({
      open: menuOpen,
      onDismiss: () => setMenuOpen(false),
    });

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const {
    containerRef: workspaceMenuContainerRef,
    popupRef: workspaceMenuRef,
  } = usePopoverLifecycle<HTMLDivElement, HTMLDivElement>({
    open: workspaceOpen,
    onDismiss: () => setWorkspaceOpen(false),
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useDismissibleLayer<HTMLElement>({
    open: drawerOpen,
    onDismiss: () => setDrawerOpen(false),
    trapFocus: true,
    initialFocusRef: null,
    focusOnOpen: null,
    restoreFocus: null,
  });
  const [authActionError, setAuthActionError] = useState<unknown>(null);
  const [authActionPending, setAuthActionPending] = useState(false);
  const authActionLock = useRef(new ExclusiveActionLock());

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
    setWorkspaceOpen(false);
  }, [pathname]);

  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (p) => p.id === appState.currentFiscalPeriodId,
  );

  const fiscalPeriodLabel = currentFiscalPeriod?.name ?? "期間 未選択";
  const displayName = session?.user.displayName ?? "";
  const email = session != null ? userEmail(session.user) : "";
  const canSignOut = session != null && userCanSignOut(session.user);

  async function handleSignInClick() {
    const release = authActionLock.current.tryAcquire();
    if (release == null) return;
    setAuthActionError(null);
    if (openkkConfig.authMode === "embedded") {
      appState.signInAsEmbeddedUser();
      release();
      return;
    }
    setAuthActionPending(true);
    let navigationStarted = false;
    try {
      const redirectUrl = `${window.location.origin}/auth/result`;
      const result = await appState.startSignIn(redirectUrl);
      window.location.href = result.authUrl;
      navigationStarted = true;
    } catch (error) {
      setAuthActionError(
        AppError.from(error, {
          fallbackUserMessage: "サインインを開始できませんでした",
          fallbackDeveloperMessage: "shell: startSignIn failed",
          statusCode: null,
        }),
      );
    } finally {
      if (!navigationStarted) {
        setAuthActionPending(false);
        release();
      }
    }
  }

  async function handleSignOut() {
    const release = authActionLock.current.tryAcquire();
    if (release == null) return;
    setMenuOpen(false);
    setAuthActionError(null);
    setAuthActionPending(true);
    try {
      await appState.signOut();
    } catch (error) {
      setAuthActionError(
        AppError.from(error, {
          fallbackUserMessage:
            "この端末ではサインアウトしましたが、サーバーへの通知に失敗しました",
          fallbackDeveloperMessage:
            "shell: remote signOut failed after clearing local session",
          statusCode: null,
        }),
      );
    } finally {
      setAuthActionPending(false);
      release();
    }
    router.push("/");
  }

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

          <div
            ref={workspaceMenuContainerRef}
            style={{ padding: "0 8px 8px", position: "relative" }}
          >
            <button
              type="button"
              className="bk-ws-trigger"
              disabled={!workspaceEnabled}
              onClick={() => {
                if (!workspaceEnabled) return;
                setWorkspaceOpen((v) => !v);
              }}
              aria-haspopup="menu"
              aria-expanded={workspaceOpen}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 8,
                border: "none",
                background: workspaceOpen ? PALETTE.navHoverBg : "transparent",
                cursor: workspaceEnabled ? "pointer" : "default",
                opacity: workspaceEnabled ? 1 : 0.55,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: fontSize.base,
                  fontWeight: fontWeight.semibold,
                  color: PALETTE.titleColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fiscalPeriodLabel}
              </div>
              {workspaceEnabled ? (
                <ChevronDownIcon size={12} color={PALETTE.subtitleColor} />
              ) : null}
            </button>

            {workspaceOpen ? (
              <div
                ref={workspaceMenuRef}
                role="menu"
                tabIndex={-1}
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  top: "100%",
                  background: palette.surface,
                  border: `1px solid ${PALETTE.menuBorder}`,
                  borderRadius: 12,
                  boxShadow: shadows.popup,
                  zIndex: 100,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 14px 6px",
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.bold,
                    color: palette.textLabel,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  期間
                </div>
                {appState.fiscalPeriods.length === 0 ? (
                  <div
                    style={{
                      padding: "8px 14px 12px",
                      fontSize: fontSize.sm,
                      color: palette.textLabel,
                      lineHeight: 1.6,
                    }}
                  >
                    期間がまだありません。下の「リストを開く」から作成してください。
                  </div>
                ) : (
                  <div style={{ padding: "0 0 4px" }}>
                    {appState.fiscalPeriods.map((p) => {
                      const isCurrent = p.id === appState.currentFiscalPeriodId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="menuitem"
                          className="bk-menu-item"
                          onClick={() => {
                            appState.selectFiscalPeriod(p.id);
                            setWorkspaceOpen(false);
                            router.push("/steps");
                          }}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "8px 14px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <span
                            style={{
                              fontSize: fontSize.base,
                              fontWeight: isCurrent
                                ? fontWeight.bold
                                : fontWeight.medium,
                              color: palette.text,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {p.name}
                          </span>
                          {isCurrent ? (
                            <CheckIcon size={14} color={palette.brand} />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div
                  style={{
                    borderTop: `1px solid ${PALETTE.menuDivider}`,
                    padding: "4px 0 6px",
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="bk-menu-item"
                    onClick={() => {
                      setWorkspaceOpen(false);
                      router.push("/fiscal-periods");
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 14px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: fontSize.base,
                        fontWeight: fontWeight.semibold,
                        color: palette.brand,
                      }}
                    >
                      リストを開く
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ padding: "6px 8px 0", display: "grid", gap: 2 }}>
            {navItems.map((item) => {
              const selected =
                navEnabled &&
                (pathname === item.href ||
                  pathname.startsWith(item.href + "/"));
              const commonStyle = {
                display: "flex",
                alignItems: "center",
                gap: 10,

                padding: "10px 12px",
                borderRadius: 8,
                background: selected ? PALETTE.navActiveBg : "transparent",
                color: selected ? PALETTE.navActiveText : PALETTE.navText,
                fontSize: fontSize.base,
                fontWeight: selected ? fontWeight.bold : fontWeight.medium,
                textDecoration: "none",
                opacity: navEnabled ? 1 : 0.45,
              };
              if (!navEnabled) {
                return (
                  <div
                    key={item.href}
                    aria-disabled
                    style={{ ...commonStyle, cursor: "default" }}
                  >
                    <item.Icon size={16} color={PALETTE.navIcon} />
                    <span>{item.label}</span>
                  </div>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={selected ? "bk-nav-item-active" : "bk-nav-item"}
                  style={{ ...commonStyle, cursor: "pointer" }}
                >
                  <item.Icon
                    size={16}
                    color={selected ? PALETTE.navIconActive : PALETTE.navIcon}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          <div
            ref={accountMenuContainerRef}
            style={{ padding: 8, position: "relative" }}
          >
            {hasSession && brandConfig.marketingSiteUrl != null ? (
              <button
                type="button"
                onClick={() => openExternalUrl(brandConfig.marketingSiteUrl!)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 6,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: palette.text,
                  color: palette.surface,
                  cursor: "pointer",
                  fontSize: fontSize.base,
                  fontWeight: fontWeight.bold,
                }}
              >
                <ExternalLinkIcon size={14} color={palette.surface} />
                <span>公式サイト</span>
              </button>
            ) : null}
            {hasSession ? (
              <>
                <button
                  type="button"
                  aria-label="アカウントメニュー"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="bk-user-trigger"
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: menuOpen ? PALETTE.navHoverBg : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      background: PALETTE.userAvatarBg,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {brandConfig.accountIconUrl != null ? (
                      <img
                        src={brandConfig.accountIconUrl}
                        alt=""
                        width={20}
                        height={20}
                        style={{ filter: "grayscale(1)" }}
                      />
                    ) : (
                      <PersonIcon size={18} color="#DADCE0" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: fontSize.base,
                        fontWeight: fontWeight.semibold,
                        color: PALETTE.titleColor,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {displayName}
                    </div>
                    {email !== "" && (
                      <div
                        style={{
                          fontSize: fontSize.xs,
                          color: PALETTE.subtitleColor,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {email}
                      </div>
                    )}
                  </div>
                  <ChevronDownIcon size={14} color={PALETTE.subtitleColor} />
                </button>

                {menuOpen && (
                  <div
                    ref={menuRef}
                    role="menu"
                    tabIndex={-1}
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 8,
                      bottom: 62,
                      background: palette.surface,
                      border: `1px solid ${PALETTE.menuBorder}`,
                      borderRadius: 12,
                      boxShadow: shadows.popup,
                      zIndex: 100,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 14px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        borderBottom: `1px solid ${PALETTE.menuDivider}`,
                      }}
                    >
                      <div
                        style={{
                          width: sizes.field.height,
                          height: sizes.field.height,
                          borderRadius: 999,
                          background: PALETTE.userAvatarBg,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {brandConfig.accountIconUrl != null ? (
                          <img
                            src={brandConfig.accountIconUrl}
                            alt=""
                            width={24}
                            height={24}
                            style={{ filter: "grayscale(1)" }}
                          />
                        ) : (
                          <PersonIcon size={22} color="#DADCE0" />
                        )}
                      </div>
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
                          {displayName}
                        </div>
                        {email !== "" && (
                          <div
                            style={{
                              marginTop: 2,
                              fontSize: fontSize.sm,
                              color: PALETTE.subtitleColor,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {email}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ padding: "6px 0" }}>
                      <MenuButton
                        icon={
                          <PersonIcon
                            size={18}
                            color={PALETTE.menuIconDisabled}
                          />
                        }
                        label="プロフィール"
                        labelColor={PALETTE.menuTextDisabled}
                        disabled
                        onClick={() => undefined}
                      />
                    </div>

                    <div
                      style={{
                        borderTop: `1px solid ${PALETTE.menuDivider}`,
                        padding: "6px 0 8px",
                      }}
                    >
                      {brandConfig.productSiteUrl != null && (
                        <MenuButton
                          icon={
                            <ExternalLinkIcon
                              size={18}
                              color={PALETTE.menuLink}
                            />
                          }
                          label="公式サイト"
                          labelColor={PALETTE.menuLink}
                          onClick={() => {
                            setMenuOpen(false);
                            openExternalUrl(brandConfig.productSiteUrl!);
                          }}
                          disabled={null}
                        />
                      )}
                      <MenuButton
                        icon={
                          <LogoutIcon
                            size={18}
                            color={
                              canSignOut
                                ? PALETTE.menuIconActive
                                : PALETTE.menuIconDisabled
                            }
                          />
                        }
                        label="サインアウト"
                        labelColor={
                          canSignOut
                            ? PALETTE.menuTextActive
                            : PALETTE.menuTextDisabled
                        }
                        disabled={!canSignOut || authActionPending}
                        onClick={() => void handleSignOut()}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleSignInClick}
                disabled={authActionPending}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: spacing.s8,
                  height: sizes.button.ctaHeight,
                  minWidth: sizes.button.ctaMinWidth,
                  padding: `0 ${spacing.s12}`,
                  borderRadius: radii.sm,
                  border: "none",
                  background: palette.brand,
                  color: palette.surface,
                  cursor: authActionPending ? "default" : "pointer",
                  opacity: authActionPending ? 0.65 : 1,
                  ...typography.control,
                  fontWeight: fontWeight.bold,
                  boxShadow: shadows.primaryButton,
                }}
              >
                <LoginIcon size={16} color={palette.surface} />
                <span>ログイン</span>
              </button>
            )}
          </div>
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
          {authActionError != null ? (
            <div
              role="alert"
              style={{
                padding: "10px 16px",
                background: palette.dangerBg,
                borderBottom: `1px solid ${palette.dangerBorder}`,
              }}
            >
              <AppErrorText error={authActionError} style={null} fallbackUserMessage={null} />
            </div>
          ) : null}
          <DataLoadErrorBanner />
          {children}
        </div>
      </main>
    </>
  );
}

function MenuButton(props: {
  icon: ReactNode;
  label: string;
  labelColor: string;
  disabled: boolean | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={props.disabled ?? undefined}
      onClick={props.onClick}
      className="bk-menu-item"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        border: "none",
        background: "transparent",
        cursor: props.disabled ? "default" : "pointer",
        textAlign: "left",
      }}
    >
      {props.icon}
      <span
        style={{
          fontSize: fontSize.base,
          fontWeight: fontWeight.medium,
          color: props.labelColor,
        }}
      >
        {props.label}
      </span>
    </button>
  );
}
