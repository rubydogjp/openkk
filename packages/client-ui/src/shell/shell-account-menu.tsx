"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation.js";

import {
  useBrandConfig,
  usePlatformAdapter,
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import { userCanSignOut, userEmail } from "@rubydogjp/openkk-client-domain";

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
import { usePopoverLifecycle } from "../shared/dismissible-layer.js";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LoginIcon,
  LogoutIcon,
  PersonIcon,
} from "../shared/icons.js";
import { SHELL_PALETTE } from "./shell-palette.js";

export function ShellAccountMenu(props: {
  pathname: string;
  hasSession: boolean;
  authActionPending: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const { hasSession, authActionPending } = props;
  const appState = useOpenkkAppState();
  const brandConfig = useBrandConfig();
  const navigation = usePlatformAdapter().navigation;
  const myPagePath = useOpenkkConfig().myPagePath;
  const router = useRouter();
  const marketingSiteUrl = brandConfig.marketingSiteUrl;
  const productSiteUrl = brandConfig.productSiteUrl;
  const session = appState.session;
  const displayName = session?.user.displayName ?? "";
  const email = session != null ? userEmail(session.user) : null;
  const canSignOut = session != null && userCanSignOut(session.user);

  const [menuOpen, setMenuOpen] = useState(false);
  const { containerRef, popupRef } = usePopoverLifecycle<
    HTMLDivElement,
    HTMLDivElement
  >({
    open: menuOpen,
    onDismiss: () => setMenuOpen(false),
  });

  useEffect(() => {
    setMenuOpen(false);
  }, [props.pathname]);

  function handleSignOut() {
    setMenuOpen(false);
    props.onSignOut();
  }

  return (
    <div ref={containerRef} style={{ padding: 8, position: "relative" }}>
      {hasSession && marketingSiteUrl != null ? (
        <button
          type="button"
          onClick={() => navigation.openExternal(marketingSiteUrl)}
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
            onClick={() => setMenuOpen((open) => !open)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: menuOpen ? SHELL_PALETTE.navHoverBg : "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <AccountAvatar size={30} iconSize={20} placeholderSize={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: fontSize.base,
                  fontWeight: fontWeight.semibold,
                  color: SHELL_PALETTE.titleColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {displayName}
              </div>
              {email != null && (
                <div
                  style={{
                    fontSize: fontSize.xs,
                    color: SHELL_PALETTE.subtitleColor,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {email}
                </div>
              )}
            </div>
            <ChevronDownIcon size={14} color={SHELL_PALETTE.subtitleColor} />
          </button>

          {menuOpen && (
            <div
              ref={popupRef}
              role="menu"
              tabIndex={-1}
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 62,
                background: palette.surface,
                border: `1px solid ${SHELL_PALETTE.menuBorder}`,
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
                  borderBottom: `1px solid ${SHELL_PALETTE.menuDivider}`,
                }}
              >
                <AccountAvatar size={40} iconSize={24} placeholderSize={22} />
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
                    {displayName}
                  </div>
                  {email != null && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: fontSize.sm,
                        color: SHELL_PALETTE.subtitleColor,
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

              {myPagePath != null ? (
                <div
                  style={{
                    padding: "6px 0",
                    borderBottom: `1px solid ${SHELL_PALETTE.menuDivider}`,
                  }}
                >
                  <MenuButton
                    icon={
                      <PersonIcon
                        size={18}
                        color={SHELL_PALETTE.menuIconActive}
                      />
                    }
                    label="マイページ"
                    labelColor={SHELL_PALETTE.menuTextActive}
                    disabled={false}
                    onClick={() => {
                      setMenuOpen(false);
                      router.push(myPagePath);
                    }}
                  />
                </div>
              ) : null}

              <div style={{ padding: "6px 0 8px" }}>
                {productSiteUrl != null && (
                  <MenuButton
                    icon={
                      <ExternalLinkIcon
                        size={18}
                        color={SHELL_PALETTE.menuLink}
                      />
                    }
                    label="公式サイト"
                    labelColor={SHELL_PALETTE.menuLink}
                    disabled={false}
                    onClick={() => {
                      setMenuOpen(false);
                      navigation.openExternal(productSiteUrl);
                    }}
                  />
                )}
                <MenuButton
                  icon={
                    <LogoutIcon
                      size={18}
                      color={
                        canSignOut
                          ? SHELL_PALETTE.menuIconActive
                          : SHELL_PALETTE.menuIconDisabled
                      }
                    />
                  }
                  label="サインアウト"
                  labelColor={
                    canSignOut
                      ? SHELL_PALETTE.menuTextActive
                      : SHELL_PALETTE.menuTextDisabled
                  }
                  disabled={!canSignOut || authActionPending}
                  onClick={handleSignOut}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={props.onSignIn}
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
          <span>サインイン</span>
        </button>
      )}
    </div>
  );
}

function MenuButton(props: {
  icon: ReactNode;
  label: string;
  labelColor: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
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

function AccountAvatar(props: {
  size: number;
  iconSize: number;
  placeholderSize: number;
}) {
  const brandConfig = useBrandConfig();
  return (
    <div
      style={{
        width: props.size,
        height: props.size,
        borderRadius: 999,
        background: SHELL_PALETTE.userAvatarBg,
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
          width={props.iconSize}
          height={props.iconSize}
          style={{ filter: "grayscale(1)" }}
        />
      ) : (
        <PersonIcon size={props.placeholderSize} color="#DADCE0" />
      )}
    </div>
  );
}
