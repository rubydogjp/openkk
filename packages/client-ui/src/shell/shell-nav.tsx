"use client";

import Link from "next/link.js";
import type { ReactNode } from "react";

import { fontSize, fontWeight } from "../shared/design-tokens.js";
import {
  AssistIcon,
  JournalIcon,
  StepsIcon,
  type IconProps,
} from "../shared/icons.js";
import { SHELL_PALETTE } from "./shell-palette.js";

type NavEntry = {
  href: string;
  label: string;
  Icon: (props: IconProps) => ReactNode;
};

const navItems: NavEntry[] = [
  { href: "/steps", label: "手順", Icon: StepsIcon },
  { href: "/entries", label: "仕訳", Icon: JournalIcon },
  { href: "/assist", label: "補助", Icon: AssistIcon },
];

export function ShellNav(props: { pathname: string; enabled: boolean }) {
  const { pathname, enabled } = props;
  return (
    <div style={{ padding: "6px 8px 0", display: "grid", gap: 2 }}>
      {navItems.map((item) => {
        const selected =
          enabled &&
          (pathname === item.href || pathname.startsWith(`${item.href}/`));
        const commonStyle = {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 8,
          background: selected ? SHELL_PALETTE.navActiveBg : "transparent",
          color: selected ? SHELL_PALETTE.navActiveText : SHELL_PALETTE.navText,
          fontSize: fontSize.base,
          fontWeight: selected ? fontWeight.bold : fontWeight.medium,
          textDecoration: "none",
          opacity: enabled ? 1 : 0.45,
        };
        if (!enabled) {
          return (
            <div
              key={item.href}
              aria-disabled
              style={{ ...commonStyle, cursor: "default" }}
            >
              <item.Icon size={16} color={SHELL_PALETTE.navIcon} />
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
              color={
                selected ? SHELL_PALETTE.navIconActive : SHELL_PALETTE.navIcon
              }
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
