"use client";

import { useRef, useState, type ReactNode } from "react";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
} from "../shared/design-tokens.js";
import { usePopoverLifecycle } from "../shared/dismissible-layer.js";

export type EntryFileKind = "json" | "csv";

export function EntryFileActionsButton(props: {
  onImportFile: ((kind: EntryFileKind, file: File) => void) | null;
  onExport: ((kind: EntryFileKind) => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const { containerRef, popupRef: menuRef } = usePopoverLifecycle<
    HTMLDivElement,
    HTMLDivElement
  >({
    open,
    onDismiss: () => setOpen(false),
  });

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <style>{`
        .bk-menu-item { transition: background 80ms ease; }
        .bk-menu-item:hover { background: #F1F5F9; }
      `}</style>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          height: sizes.button.compactHeight,
          minWidth: sizes.button.compactIconTextMinWidth,
          padding: "0 14px",
          borderRadius: radii.sm,
          border: `1px solid ${palette.borderSubtle}`,
          background: open ? "#F1F5F9" : "#FFFFFF",
          color: palette.text,
          fontSize: fontSize.base,
          fontWeight: fontWeight.semibold,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: spacing.s8,
          transition: "background 80ms ease",
        }}
      >
        <FileOpenIcon />
        ファイル
        <ChevronDown />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          style={{
            position: "absolute",
            top: 42,
            right: 0,
            zIndex: 60,
            minWidth: 240,
            background: "#FFFFFF",
            border: `1px solid ${palette.borderSubtle}`,
            borderRadius: radii.md,
            boxShadow:
              "0 12px 32px rgba(15, 23, 42, 0.12), 0 2px 4px rgba(15, 23, 42, 0.04)",
            padding: 6,
            display: "grid",
            gap: 2,
          }}
        >
          {props.onImportFile != null ? (
            <>
              <MenuSectionLabel>読み込む</MenuSectionLabel>
              <FileMenuItem
                accept=".json,application/json"
                onSelect={(file) => {
                  props.onImportFile?.("json", file);
                  setOpen(false);
                }}
              >
                JSON ファイルから
              </FileMenuItem>
              <FileMenuItem
                accept=".csv,text/csv"
                onSelect={(file) => {
                  props.onImportFile?.("csv", file);
                  setOpen(false);
                }}
              >
                CSV ファイルから
              </FileMenuItem>
            </>
          ) : null}
          {props.onImportFile != null && props.onExport != null ? (
            <MenuDivider />
          ) : null}
          {props.onExport != null ? (
            <>
              <MenuSectionLabel>書き出す</MenuSectionLabel>
              <MenuItem
                onClick={() => {
                  props.onExport?.("json");
                  setOpen(false);
                }}
              >
                JSON でダウンロード
              </MenuItem>
              <MenuItem
                onClick={() => {
                  props.onExport?.("csv");
                  setOpen(false);
                }}
              >
                CSV でダウンロード
              </MenuItem>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 12px 4px",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        color: palette.textMuted,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function MenuDivider() {
  return (
    <div
      style={{
        height: 1,
        background: palette.borderSubtle,
        margin: "6px 4px",
      }}
    />
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="bk-menu-item"
      style={{
        height: 34,
        padding: "0 12px",
        textAlign: "left",
        border: "none",
        background: "transparent",
        color: palette.text,
        fontSize: fontSize.base,
        fontWeight: fontWeight.medium,
        cursor: "pointer",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function FileMenuItem({
  accept,
  onSelect,
  children,
}: {
  accept: string;
  onSelect: (file: File) => void;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="bk-menu-item"
        onClick={() => inputRef.current?.click()}
        style={{
          height: 34,
          padding: "0 12px",
          border: "none",
          textAlign: "left",
          background: "transparent",
          color: palette.text,
          fontSize: fontSize.base,
          fontWeight: fontWeight.medium,
          cursor: "pointer",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file != null) {
            onSelect(file);
          }
          event.currentTarget.value = "";
        }}
        style={{ display: "none" }}
      />
    </>
  );
}

function ChevronDown() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <polyline
        points="6 9 12 15 18 9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileOpenIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        display: "block",
        flexShrink: 0,
        backgroundColor: "currentColor",
        maskImage: "url('/icons/file-open.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/file-open.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
