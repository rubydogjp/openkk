"use client";

import { useRouter } from "next/navigation.js";
import { useEffect, useState } from "react";

import { useOpenkkAppState } from "@rubydogjp/openkk-client-usecases";

import {
  fontSize,
  fontWeight,
  palette,
  shadows,
} from "../shared/design-tokens.js";
import { usePopoverLifecycle } from "../shared/dismissible-layer.js";
import { CheckIcon, ChevronDownIcon } from "../shared/icons.js";
import { SHELL_PALETTE } from "./shell-palette.js";

export function ShellFiscalPeriodMenu(props: {
  pathname: string;
  enabled: boolean;
}) {
  const appState = useOpenkkAppState();
  const router = useRouter();
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

  const fiscalPeriodLabel = appState.currentFiscalPeriod?.name ?? "期間 未選択";

  return (
    <div
      ref={containerRef}
      style={{ padding: "0 8px 8px", position: "relative" }}
    >
      <button
        type="button"
        className="bk-fiscal-period-trigger"
        disabled={!props.enabled}
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          border: "none",
          background: menuOpen ? SHELL_PALETTE.navHoverBg : "transparent",
          cursor: props.enabled ? "pointer" : "default",
          opacity: props.enabled ? 1 : 0.55,
          textAlign: "left",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            color: SHELL_PALETTE.titleColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {fiscalPeriodLabel}
        </div>
        {props.enabled ? (
          <ChevronDownIcon size={12} color={SHELL_PALETTE.subtitleColor} />
        ) : null}
      </button>

      {menuOpen ? (
        <div
          ref={popupRef}
          role="menu"
          tabIndex={-1}
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            top: "100%",
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
              {appState.fiscalPeriods.map((period) => {
                const isCurrent = period.id === appState.currentFiscalPeriodId;
                return (
                  <button
                    key={period.id}
                    type="button"
                    role="menuitem"
                    className="bk-menu-item"
                    onClick={() => {
                      appState.selectFiscalPeriod(period.id);
                      setMenuOpen(false);
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
                      {period.name}
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
              borderTop: `1px solid ${SHELL_PALETTE.menuDivider}`,
              padding: "4px 0 6px",
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="bk-menu-item"
              onClick={() => {
                setMenuOpen(false);
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
  );
}
