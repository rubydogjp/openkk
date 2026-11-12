"use client";

import type { ReactNode, RefObject } from "react";

import { palette, shadows, sizes } from "./design-tokens.js";

export const DRAWER_SLIDE_IN_ANIMATION =
  "bk-drawer-slide-in 220ms cubic-bezier(0.2, 0, 0, 1)";

export const DRAWER_SLIDE_IN_KEYFRAMES = `
  @keyframes bk-drawer-slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
`;

export function DrawerFrame(props: {
  label: string;
  drawerRef: RefObject<HTMLElement | null>;
  onBackdropClick: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div
        onClick={props.onBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.32)",
          zIndex: 9998,
        }}
      />
      <aside
        ref={props.drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: sizes.drawer.width,
          maxWidth: "100vw",
          height: "100vh",
          background: palette.surface,
          zIndex: 9999,
          boxShadow: shadows.drawer,
          display: "flex",
          flexDirection: "column",
          animation: DRAWER_SLIDE_IN_ANIMATION,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <style>{DRAWER_SLIDE_IN_KEYFRAMES}</style>
        {props.children}
      </aside>
    </>
  );
}
