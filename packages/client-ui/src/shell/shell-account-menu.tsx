"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  useBrandConfig,
  useOpenkkAppState,
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
import { openExternalUrl } from "../shared/external-navigation.js";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LoginIcon,
  LogoutIcon,
  PersonIcon,
} from "../shared/icons.js";
import { SHELL_PALETTE as PALETTE } from "./shell-palette.js";

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
  const marketingSiteUrl = brandConfig.marketingSiteUrl;
  const productSiteUrl = brandConfig.productSiteUrl;
  const session = appState.session;
  const displayName = session?.user.displayName ?? "";
  const email = session != null ? userEmail(session.user) : null;
  const canSignOut = session != null && userCanSignOut(session.user);

  const [menuOpen, setMenuOpen] = useState(false);
  const { containerRef: accountMenuContainerRef, popupRef: menuRef } =
    usePopoverLifecycle<HTMLDivElement, HTMLDivElement>({
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
    <div
      ref={accountMenuContainerRef}
      style={{ padding: 8, position: "relative" }}
    >
      {hasSession && marketingSiteUrl != null ? (
        <button
          type="button"
          onClick={() => openExternalUrl(marketingSiteUrl, null)}
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
            <AccountAvatar size={30} iconSize={20} placeholderSize={18} />
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
              {email != null && (
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
                <AccountAvatar
                  size={sizes.field.height}
                  iconSize={24}
                  placeholderSize={22}
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
                    {displayName}
                  </div>
                  {email != null && (
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
                  onClick={() => {}}
                />
              </div>

              <div
                style={{
                  borderTop: `1px solid ${PALETTE.menuDivider}`,
                  padding: "6px 0 8px",
                }}
              >
                {productSiteUrl != null && (
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
                      openExternalUrl(productSiteUrl, null);
                    }}
                    disabled={false}
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
          <span>ログイン</span>
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
  size: number | string;
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
