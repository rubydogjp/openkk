

const slate = {
  white: "#FFFFFF",
  s50: "#F6F9FC",
  s100: "#EAF0F6",
  s200: "#E2E8F0",
  s300: "#CBD5E1",
  s400: "#94A3B8",
  s500: "#64748B",
  s600: "#475569",
  s700: "#334155",
  s900: "#0F172A",
};

export const palette = {

  surface: slate.white,

  pageBg: slate.white,

  surfaceTint: slate.s50,

  chromeSurface: slate.white,

  headerSurface: slate.s100,

  hairline: slate.s200,
  borderSubtle: slate.s200,
  borderStrong: slate.s300,
  borderEmphasis: slate.s400,
  borderHeavy: slate.s400,

  formGroupBg: slate.s50,

  hoverSubtle: slate.s50,

  hoverStrong: slate.s200,

  text: slate.s900,
  textSoft: slate.s600,
  textLabel: slate.s500,
  textMuted: slate.s400,
  textOnDark: slate.white,

  brandInk: slate.s900,
  brandPaper: slate.white,
  action: "#1D4ED8",
  actionHover: "#1E40AF",
  actionBg: "#EEF5FF",
  actionBorder: "#93C5FD",
  decision: "#15803D",
  decisionHover: "#166534",
  decisionBg: "#ECFDF3",
  decisionBorder: "#86EFAC",
  brand: "#1D4ED8",
  brandHover: "#1E40AF",
  brandShadow: "rgba(37, 99, 235, 0.22)",
  brandActiveBg: "#EEF5FF",
  brandActiveBgStrong: "#DBEAFE",
  brandTint: "#EEF5FF",
  brandBorder: "#93C5FD",

  success: "#15803D",
  successBg: "#ECFDF3",
  successBorder: "#86EFAC",
  warning: "#D97706",
  warningBg: "#FFFBEB",
  warningBorder: "#FDE68A",
  danger: "#DC2626",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",

  accountAsset: "#2563EB",
  accountAssetBg: "#EFF6FF",
  accountAssetBorder: "#BFDBFE",
  accountLiability: "#E11D48",
  accountLiabilityBg: "#FFF1F2",
  accountLiabilityBorder: "#FDA4AF",
  accountEquity: "#15803D",
  accountEquityBg: "#ECFDF3",
  accountEquityBorder: "#86EFAC",
  accountRevenue: "#15803D",
  accountRevenueBg: "#ECFDF3",
  accountRevenueBorder: "#86EFAC",
  accountExpense: "#2563EB",
  accountExpenseBg: "#EFF6FF",
  accountExpenseBorder: "#BFDBFE",
  accountProfit: "#15803D",
  accountProfitBg: "#ECFDF3",
  accountProfitBorder: "#86EFAC",
  accountLoss: "#E11D48",
  accountLossBg: "#FFF1F2",
  accountLossBorder: "#FDA4AF",
};

export const slateScale = slate;

export const shadows = {

  card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.03)",

  drawer:
    "-16px 0 40px rgba(15, 23, 42, 0.12), -2px 0 4px rgba(15, 23, 42, 0.04)",

  popup: "0 12px 32px rgba(15, 23, 42, 0.14), 0 2px 4px rgba(15, 23, 42, 0.04)",

  inputInset: "inset 0 1px 0 rgba(15, 23, 42, 0.04)",

  primaryButton: "0 1px 2px rgba(37, 99, 235, 0.22)",
};

export const rings = {
  brandFocus: "0 0 0 3px rgba(37, 99, 235, 0.14)",
};

export const fontSize = {
  micro: 10,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 15,
  xl: 18,
};

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export const fontFamily = {
  sans: 'var(--font-sans), "Noto Sans JP", sans-serif',
  mono: 'var(--font-mono), "Noto Sans Mono", ui-monospace, monospace',
};

export const typography = {
  finePrint: {
    fontSize: fontSize.micro,
    lineHeight: 1.4,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    fontSize: fontSize.xs,
    lineHeight: 1.45,
    fontWeight: fontWeight.medium,
  },
  helper: {
    fontSize: fontSize.sm,
    lineHeight: 1.6,
    fontWeight: fontWeight.regular,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: 1.7,
    fontWeight: fontWeight.regular,
  },
  input: {
    fontSize: fontSize.md,
    lineHeight: 1.45,
    fontWeight: fontWeight.regular,
  },
  label: {
    fontSize: fontSize.sm,
    lineHeight: 1.4,
    fontWeight: fontWeight.semibold,
  },
  control: {
    fontSize: fontSize.base,
    lineHeight: 1.4,
    fontWeight: fontWeight.semibold,
  },
  amount: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.base,
    lineHeight: 1.4,
    fontWeight: fontWeight.semibold,
  },
  chip: {
    fontSize: fontSize.sm,
    lineHeight: 1.35,
    fontWeight: fontWeight.regular,
  },
  accountLabel: {
    fontSize: fontSize.base,
    lineHeight: 1.35,
    fontWeight: fontWeight.bold,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    lineHeight: 1.45,
    fontWeight: fontWeight.bold,
  },
  contentTitle: {
    fontSize: fontSize.xl,
    lineHeight: 1.4,
    fontWeight: fontWeight.bold,
  },
  dialogTitle: {
    fontSize: 20,
    lineHeight: 1.3,
    fontWeight: fontWeight.bold,
  },
  pageTitle: {
    fontSize: 24,
    lineHeight: 1.25,
    fontWeight: fontWeight.bold,
  },
} as const;

export const spacing = {
  s2: 2,
  s4: 4,
  s6: 6,
  s8: 8,
  s10: 10,
  s12: 12,
  s14: 14,
  s16: 16,
  s20: 20,
  s24: 24,
  s28: 28,
  s32: 32,
  s40: 40,
};

export const radii = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  pill: 999,
};

export const sizes = {
  button: {
    compactHeight: 36,
    compactMinWidth: 72,
    compactIconTextMinWidth: 88,
    formHeight: 40,
    formSecondaryMinWidth: 88,
    formPrimaryMinWidth: 96,
    ctaHeight: 44,
    ctaMinWidth: 112,
    iconOnly: 36,
    mobileHit: 48,
  },
  field: {
    height: 40,
    paddingX: 12,
  },
  chip: {
    height: 30,
  },
  account: {
    tableHeight: 36,
    inlineHeight: 28,
    tableWidth: 136,
  },
  shell: {
    sidebarWidth: 216,
    mobileTopbarHeight: 48,
  },
  content: {
    readingMaxWidth: 720,
    formMaxWidth: 560,
    controlBarMaxWidth: 960,
    dataMaxWidth: 1360,
    debugMaxWidth: 1160,
  },
  drawer: {
    width: 560,
    headerHeight: 52,
  },
} as const;
