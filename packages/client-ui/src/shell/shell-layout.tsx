"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  useOpenkkAppState,
  useBrandConfig,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  spacing,
  typography,
} from "../shared/design-tokens";
import { normalizePathname } from "../shared/pathname";
// アプリ表示中に発火する beforeinstallprompt を早期に捕捉しておく（side-effect）。
import "../shared/pwa-install";
import { FiscalPeriodsContent } from "./fiscal-periods-content";
import { SignInContent } from "./sign-in-content";

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

const PICKER_URL = "/fiscal-periods";
const CREATE_URL = "/fiscal-periods/new";

type ContentMode = "loading" | "sign-in" | "fiscal-periods" | "normal";

export function OpenkkShellLayout(props: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname());
  const router = useRouter();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const brandConfig = useBrandConfig();
  const session = appState.session;
  const isDemoMode = openkkConfig.isDemoMode;
  const editionLabel = brandConfig.editionLabel ?? "";
  const hasPeriod =
    appState.currentFiscalPeriodId != null &&
    appState.currentFiscalPeriodId !== "";

  const contentMode: ContentMode = !appState.isReady
    ? "loading"
    : session == null
      ? "sign-in"
      : pathname === PICKER_URL
        ? "fiscal-periods"
        : !hasPeriod && pathname !== CREATE_URL
          ? "fiscal-periods"
          : "normal";

  useEffect(() => {
    if (!appState.isReady) return;
    if (session == null) return;
    if (hasPeriod) return;
    if (pathname === PICKER_URL || pathname === CREATE_URL) return;
    router.replace(PICKER_URL);
  }, [appState.isReady, session, hasPeriod, pathname, router]);

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
    <ShellChrome
      pathname={pathname}
      router={router}
      contentMode={contentMode}
      isDemoMode={isDemoMode}
      editionLabel={editionLabel}
    >
      {contentMode === "sign-in" ? (
        <SignInContent />
      ) : contentMode === "fiscal-periods" ? (
        <FiscalPeriodsContent />
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
  isDemoMode,
  editionLabel,
  children,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
  contentMode: Exclude<ContentMode, "loading">;
  isDemoMode: boolean;
  editionLabel: string;
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
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!workspaceOpen) return;
    function onDown(e: MouseEvent) {
      if (
        workspaceMenuRef.current?.contains(e.target as Node) ||
        workspaceTriggerRef.current?.contains(e.target as Node)
      )
        return;
      setWorkspaceOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [workspaceOpen]);

  useEffect(() => {
    setMenuOpen(false);
    setWorkspaceOpen(false);
  }, [pathname]);

  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (p) => p.id === appState.currentFiscalPeriodId,
  );

  const fiscalPeriodLabel = currentFiscalPeriod?.name ?? "期間 未選択";
  const displayName = session?.displayName ?? "";
  const email = isDemoMode ? "" : (session?.email ?? "");

  function navigate(href: string) {
    setMenuOpen(false);
    router.push(href);
  }

  async function handleSignInClick() {
    if (openkkConfig.isMockMode) {
      appState.signInAsMockUser();
      return;
    }
    try {
      const redirectUrl = `${window.location.origin}/auth/result`;
      const result = await appState.startSignIn(redirectUrl);
      window.location.href = result.authUrl;
    } catch {}
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
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <main
        className="bk-shell-main"
        style={{
          height: "100vh",
          display: "grid",
          gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`,
          overflow: "hidden",
        }}
      >
        <aside
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
                {editionLabel}
              </div>
            </div>
          </div>

          <div style={{ padding: "0 8px 8px", position: "relative" }}>
            <button
              ref={workspaceTriggerRef}
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

          <div style={{ padding: 8, position: "relative" }}>
            {hasSession &&
            isDemoMode &&
            brandConfig.marketingSiteUrl != null ? (
              <button
                type="button"
                onClick={() =>
                  window.open(brandConfig.marketingSiteUrl, "_blank")
                }
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
                  ref={triggerRef}
                  type="button"
                  aria-label="アカウントメニュー"
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
                    {isDemoMode ? (
                      <img
                        src="/images/demo-mode.svg"
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
                        {isDemoMode ? (
                          <img
                            src="/images/demo-mode.svg"
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
                          <PersonOutlineIcon
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
                      {isDemoMode && brandConfig.productSiteUrl != null && (
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
                            window.open(brandConfig.productSiteUrl, "_blank");
                          }}
                        />
                      )}
                      <MenuButton
                        icon={
                          <LogoutIcon
                            size={18}
                            color={PALETTE.menuIconDisabled}
                          />
                        }
                        label="サインアウト"
                        labelColor={PALETTE.menuTextDisabled}
                        disabled
                        onClick={() => undefined}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleSignInClick}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: spacing.s8,
                  height: sizes.button.ctaHeight,
                  minWidth: sizes.button.ctaMinWidth,
                  padding: `0 ${spacing.s12}px`,
                  borderRadius: radii.sm,
                  border: "none",
                  background: palette.brand,
                  color: palette.surface,
                  cursor: "pointer",
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
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
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

function StepsIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path
        d="M8 12l3 3 5-5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function JournalIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="2"
        stroke={color}
        strokeWidth="1.6"
      />
      <line
        x1="8"
        y1="8"
        x2="16"
        y2="8"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="12"
        x2="16"
        y2="12"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="16"
        x2="13"
        y2="16"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AssistIcon({ size, color }: { size: number; color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "block",
        backgroundColor: color,
        maskImage: "url('/icons/assist.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/assist.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function PersonIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.5" />
      <path
        d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PersonOutlineIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.5" />
      <path
        d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="16 17 21 12 16 7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="21"
        y1="12"
        x2="9"
        y2="12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LoginIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <polyline
        points="10 17 15 12 10 7"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="15"
        y1="12"
        x2="3"
        y2="12"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalLinkIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="15 3 21 3 21 9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1="14"
        x2="21"
        y2="3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDownIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline
        points="6 9 12 15 18 9"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline
        points="5 12 10 17 19 7"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
