"use client";

import { useRouter } from "next/navigation.js";
import { useEffect, useState } from "react";

import { useOpenkkAppState } from "@rubydogjp/openkk-client-usecases";

import { fontSize, fontWeight, palette, shadows } from "../shared/design-tokens.js";
import { usePopoverLifecycle } from "../shared/dismissible-layer.js";
import { CheckIcon, ChevronDownIcon } from "../shared/icons.js";
import { SHELL_PALETTE as PALETTE } from "./shell-palette.js";

export function ShellFiscalPeriodMenu(props: {
  pathname: string;
  enabled: boolean;
}) {
  const appState = useOpenkkAppState();
  const router = useRouter();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const {
    containerRef: workspaceMenuContainerRef,
    popupRef: workspaceMenuRef,
  } = usePopoverLifecycle<HTMLDivElement, HTMLDivElement>({
    open: workspaceOpen,
    onDismiss: () => setWorkspaceOpen(false),
  });

  useEffect(() => {
    setWorkspaceOpen(false);
  }, [props.pathname]);

  const fiscalPeriodLabel =
    appState.fiscalPeriods.find(
      (p) => p.id === appState.currentFiscalPeriodId,
    )?.name ?? "期間 未選択";

  return (
    <div
      ref={workspaceMenuContainerRef}
      style={{ padding: "0 8px 8px", position: "relative" }}
    >
      <button
        type="button"
        className="bk-ws-trigger"
        disabled={!props.enabled}
        onClick={() => {
          if (!props.enabled) return;
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
            color: PALETTE.titleColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {fiscalPeriodLabel}
        </div>
        {props.enabled ? (
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
  );
}
