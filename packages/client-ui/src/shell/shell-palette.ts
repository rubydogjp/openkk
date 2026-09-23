import { palette, sizes } from "../shared/design-tokens.js";

export const SHELL_PALETTE = {
  sidebarBg: palette.chromeSurface,
  sidebarBorder: palette.borderHeavy,
  titleColor: palette.text,
  subtitleColor: palette.textLabel,
  navText: palette.textSoft,
  navIcon: palette.textLabel,
  navIconActive: palette.textSoft,
  navActiveBg: palette.surfaceTint,
  navActiveText: palette.text,
  navHoverBg: palette.hoverSubtle,
  userAvatarBg: palette.textSoft,
  menuLink: palette.action,
  menuTextActive: palette.textSoft,
  menuTextDisabled: palette.textMuted,
  menuIconActive: palette.textLabel,
  menuIconDisabled: palette.textMuted,
  menuDivider: palette.borderSubtle,
  menuBorder: palette.borderSubtle,
};

export const SHELL_SIDEBAR_WIDTH = sizes.shell.sidebarWidth;
