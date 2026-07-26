<!-- npm run gen-theme-docs で生成。直接編集しない。 -->

# テーマの差し替え

`@rubydogjp/openkk-client-ui` のデザイントークンは CSS custom property
(`--openkk-*`) 経由で解決される。OpenKK のコンポーネントより上の任意の要素で
`--openkk-*` を定義すれば見た目を差し替えられる。定義しなかったトークンは既定値のまま。

```css
:root {
  --openkk-color-action: #7C3AED;
  --openkk-color-text: #1F2937;
  --openkk-radius-sm: 0px;
}
```

範囲を限定したい場合は、任意の祖先要素に付ければその配下だけに効く。

```tsx
<div style={{ "--openkk-color-action": "#7C3AED" } as CSSProperties}>
  <EntriesTable rows={rows} />
</div>
```

## 部分的な上書き

トークンは独立しているので、変えたいものだけ定義すればよい。
`typography` は「個別トークン → スケール → 既定値」の順に解決するため、
どちらの粒度でも指定できる。

```css
:root {
  /* スケールを変えると、それを使う文字スタイルがまとめて追従する */
  --openkk-font-size-base: 15px;

  /* 特定の文字スタイルだけを変えることもできる */
  --openkk-typography-page-title-font-size: 32px;
}
```

## 注意

- 数値トークンの既定値は `12px` のように単位付き。上書きするときも単位を付ける。
- 帳票の印刷は別 document (iframe srcdoc) で描画されるため、ホストページの
  `--openkk-*` は継承されない。印刷物の見た目はこの仕組みの対象外。
- `slateScale` は元になる色スケールで、意味を持つトークンではないため var 化していない。
- 実値が必要な場合は `tokenDefaults` を参照する。

## 変数一覧

全 170 個。

### 色 (palette)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-color-surface` | `palette.surface` | `#FFFFFF` |
| `--openkk-color-page-bg` | `palette.pageBg` | `#FFFFFF` |
| `--openkk-color-surface-tint` | `palette.surfaceTint` | `#F6F9FC` |
| `--openkk-color-chrome-surface` | `palette.chromeSurface` | `#FFFFFF` |
| `--openkk-color-header-surface` | `palette.headerSurface` | `#EAF0F6` |
| `--openkk-color-hairline` | `palette.hairline` | `#E2E8F0` |
| `--openkk-color-border-subtle` | `palette.borderSubtle` | `#E2E8F0` |
| `--openkk-color-border-strong` | `palette.borderStrong` | `#CBD5E1` |
| `--openkk-color-border-emphasis` | `palette.borderEmphasis` | `#94A3B8` |
| `--openkk-color-border-heavy` | `palette.borderHeavy` | `#94A3B8` |
| `--openkk-color-form-group-bg` | `palette.formGroupBg` | `#F6F9FC` |
| `--openkk-color-hover-subtle` | `palette.hoverSubtle` | `#F6F9FC` |
| `--openkk-color-hover-strong` | `palette.hoverStrong` | `#E2E8F0` |
| `--openkk-color-text` | `palette.text` | `#0F172A` |
| `--openkk-color-text-soft` | `palette.textSoft` | `#475569` |
| `--openkk-color-text-label` | `palette.textLabel` | `#64748B` |
| `--openkk-color-text-muted` | `palette.textMuted` | `#94A3B8` |
| `--openkk-color-text-on-dark` | `palette.textOnDark` | `#FFFFFF` |
| `--openkk-color-brand-ink` | `palette.brandInk` | `#0F172A` |
| `--openkk-color-brand-paper` | `palette.brandPaper` | `#FFFFFF` |
| `--openkk-color-action` | `palette.action` | `#1D4ED8` |
| `--openkk-color-action-hover` | `palette.actionHover` | `#1E40AF` |
| `--openkk-color-action-bg` | `palette.actionBg` | `#EEF5FF` |
| `--openkk-color-action-border` | `palette.actionBorder` | `#93C5FD` |
| `--openkk-color-decision` | `palette.decision` | `#15803D` |
| `--openkk-color-decision-hover` | `palette.decisionHover` | `#166534` |
| `--openkk-color-decision-bg` | `palette.decisionBg` | `#ECFDF3` |
| `--openkk-color-decision-border` | `palette.decisionBorder` | `#86EFAC` |
| `--openkk-color-brand` | `palette.brand` | `#1D4ED8` |
| `--openkk-color-brand-hover` | `palette.brandHover` | `#1E40AF` |
| `--openkk-color-brand-shadow` | `palette.brandShadow` | `rgba(37, 99, 235, 0.22)` |
| `--openkk-color-brand-active-bg` | `palette.brandActiveBg` | `#EEF5FF` |
| `--openkk-color-brand-active-bg-strong` | `palette.brandActiveBgStrong` | `#DBEAFE` |
| `--openkk-color-brand-tint` | `palette.brandTint` | `#EEF5FF` |
| `--openkk-color-brand-border` | `palette.brandBorder` | `#93C5FD` |
| `--openkk-color-success` | `palette.success` | `#15803D` |
| `--openkk-color-success-bg` | `palette.successBg` | `#ECFDF3` |
| `--openkk-color-success-border` | `palette.successBorder` | `#86EFAC` |
| `--openkk-color-warning` | `palette.warning` | `#D97706` |
| `--openkk-color-warning-bg` | `palette.warningBg` | `#FFFBEB` |
| `--openkk-color-warning-border` | `palette.warningBorder` | `#FDE68A` |
| `--openkk-color-danger` | `palette.danger` | `#DC2626` |
| `--openkk-color-danger-bg` | `palette.dangerBg` | `#FEF2F2` |
| `--openkk-color-danger-border` | `palette.dangerBorder` | `#FECACA` |
| `--openkk-color-account-asset` | `palette.accountAsset` | `#2563EB` |
| `--openkk-color-account-asset-bg` | `palette.accountAssetBg` | `#EFF6FF` |
| `--openkk-color-account-asset-border` | `palette.accountAssetBorder` | `#BFDBFE` |
| `--openkk-color-account-liability` | `palette.accountLiability` | `#E11D48` |
| `--openkk-color-account-liability-bg` | `palette.accountLiabilityBg` | `#FFF1F2` |
| `--openkk-color-account-liability-border` | `palette.accountLiabilityBorder` | `#FDA4AF` |
| `--openkk-color-account-equity` | `palette.accountEquity` | `#15803D` |
| `--openkk-color-account-equity-bg` | `palette.accountEquityBg` | `#ECFDF3` |
| `--openkk-color-account-equity-border` | `palette.accountEquityBorder` | `#86EFAC` |
| `--openkk-color-account-revenue` | `palette.accountRevenue` | `#15803D` |
| `--openkk-color-account-revenue-bg` | `palette.accountRevenueBg` | `#ECFDF3` |
| `--openkk-color-account-revenue-border` | `palette.accountRevenueBorder` | `#86EFAC` |
| `--openkk-color-account-expense` | `palette.accountExpense` | `#2563EB` |
| `--openkk-color-account-expense-bg` | `palette.accountExpenseBg` | `#EFF6FF` |
| `--openkk-color-account-expense-border` | `palette.accountExpenseBorder` | `#BFDBFE` |
| `--openkk-color-account-profit` | `palette.accountProfit` | `#15803D` |
| `--openkk-color-account-profit-bg` | `palette.accountProfitBg` | `#ECFDF3` |
| `--openkk-color-account-profit-border` | `palette.accountProfitBorder` | `#86EFAC` |
| `--openkk-color-account-loss` | `palette.accountLoss` | `#E11D48` |
| `--openkk-color-account-loss-bg` | `palette.accountLossBg` | `#FFF1F2` |
| `--openkk-color-account-loss-border` | `palette.accountLossBorder` | `#FDA4AF` |

### 影 (shadows)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-shadow-card` | `shadows.card` | `0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.03)` |
| `--openkk-shadow-drawer` | `shadows.drawer` | `-16px 0 40px rgba(15, 23, 42, 0.12), -2px 0 4px rgba(15, 23, 42, 0.04)` |
| `--openkk-shadow-popup` | `shadows.popup` | `0 12px 32px rgba(15, 23, 42, 0.14), 0 2px 4px rgba(15, 23, 42, 0.04)` |
| `--openkk-shadow-input-inset` | `shadows.inputInset` | `inset 0 1px 0 rgba(15, 23, 42, 0.04)` |
| `--openkk-shadow-primary-button` | `shadows.primaryButton` | `0 1px 2px rgba(37, 99, 235, 0.22)` |

### フォーカスリング (rings)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-ring-brand-focus` | `rings.brandFocus` | `0 0 0 3px rgba(37, 99, 235, 0.14)` |

### フォントサイズ (fontSize)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-font-size-micro` | `fontSize.micro` | `10px` |
| `--openkk-font-size-xs` | `fontSize.xs` | `11px` |
| `--openkk-font-size-sm` | `fontSize.sm` | `12px` |
| `--openkk-font-size-base` | `fontSize.base` | `13px` |
| `--openkk-font-size-md` | `fontSize.md` | `14px` |
| `--openkk-font-size-lg` | `fontSize.lg` | `15px` |
| `--openkk-font-size-xl` | `fontSize.xl` | `18px` |

### フォントウェイト (fontWeight)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-font-weight-regular` | `fontWeight.regular` | `400` |
| `--openkk-font-weight-medium` | `fontWeight.medium` | `500` |
| `--openkk-font-weight-semibold` | `fontWeight.semibold` | `600` |
| `--openkk-font-weight-bold` | `fontWeight.bold` | `700` |

### フォントファミリー (fontFamily)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-font-family-sans` | `fontFamily.sans` | `var(--font-sans), "Noto Sans JP", sans-serif` |
| `--openkk-font-family-mono` | `fontFamily.mono` | `var(--font-mono), "Noto Sans Mono", ui-monospace, monospace` |

### 余白 (spacing)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-space-2` | `spacing.s2` | `2px` |
| `--openkk-space-4` | `spacing.s4` | `4px` |
| `--openkk-space-6` | `spacing.s6` | `6px` |
| `--openkk-space-8` | `spacing.s8` | `8px` |
| `--openkk-space-10` | `spacing.s10` | `10px` |
| `--openkk-space-12` | `spacing.s12` | `12px` |
| `--openkk-space-14` | `spacing.s14` | `14px` |
| `--openkk-space-16` | `spacing.s16` | `16px` |
| `--openkk-space-20` | `spacing.s20` | `20px` |
| `--openkk-space-24` | `spacing.s24` | `24px` |
| `--openkk-space-28` | `spacing.s28` | `28px` |
| `--openkk-space-32` | `spacing.s32` | `32px` |
| `--openkk-space-40` | `spacing.s40` | `40px` |

### 角丸 (radii)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-radius-xs` | `radii.xs` | `6px` |
| `--openkk-radius-sm` | `radii.sm` | `8px` |
| `--openkk-radius-md` | `radii.md` | `10px` |
| `--openkk-radius-lg` | `radii.lg` | `12px` |
| `--openkk-radius-pill` | `radii.pill` | `999px` |

### 寸法 (sizes)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-size-button-compact-height` | `sizes.button.compactHeight` | `36px` |
| `--openkk-size-button-compact-min-width` | `sizes.button.compactMinWidth` | `72px` |
| `--openkk-size-button-compact-icon-text-min-width` | `sizes.button.compactIconTextMinWidth` | `88px` |
| `--openkk-size-button-form-height` | `sizes.button.formHeight` | `40px` |
| `--openkk-size-button-form-secondary-min-width` | `sizes.button.formSecondaryMinWidth` | `88px` |
| `--openkk-size-button-form-primary-min-width` | `sizes.button.formPrimaryMinWidth` | `96px` |
| `--openkk-size-button-cta-height` | `sizes.button.ctaHeight` | `44px` |
| `--openkk-size-button-cta-min-width` | `sizes.button.ctaMinWidth` | `112px` |
| `--openkk-size-button-icon-only` | `sizes.button.iconOnly` | `36px` |
| `--openkk-size-button-mobile-hit` | `sizes.button.mobileHit` | `48px` |
| `--openkk-size-field-height` | `sizes.field.height` | `40px` |
| `--openkk-size-field-padding-x` | `sizes.field.paddingX` | `12px` |
| `--openkk-size-chip-height` | `sizes.chip.height` | `30px` |
| `--openkk-size-account-table-height` | `sizes.account.tableHeight` | `36px` |
| `--openkk-size-account-inline-height` | `sizes.account.inlineHeight` | `28px` |
| `--openkk-size-account-table-width` | `sizes.account.tableWidth` | `136px` |
| `--openkk-size-shell-sidebar-width` | `sizes.shell.sidebarWidth` | `216px` |
| `--openkk-size-shell-mobile-topbar-height` | `sizes.shell.mobileTopbarHeight` | `48px` |
| `--openkk-size-content-reading-max-width` | `sizes.content.readingMaxWidth` | `720px` |
| `--openkk-size-content-form-max-width` | `sizes.content.formMaxWidth` | `560px` |
| `--openkk-size-content-control-bar-max-width` | `sizes.content.controlBarMaxWidth` | `960px` |
| `--openkk-size-content-data-max-width` | `sizes.content.dataMaxWidth` | `1360px` |
| `--openkk-size-content-debug-max-width` | `sizes.content.debugMaxWidth` | `1160px` |
| `--openkk-size-drawer-width` | `sizes.drawer.width` | `560px` |
| `--openkk-size-drawer-header-height` | `sizes.drawer.headerHeight` | `52px` |

### 文字スタイル (typography)

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
| `--openkk-typography-fine-print-font-size` | `typography.finePrint.fontSize` | `var(--openkk-font-size-micro, 10px)` |
| `--openkk-typography-fine-print-line-height` | `typography.finePrint.lineHeight` | `1.4` |
| `--openkk-typography-fine-print-font-weight` | `typography.finePrint.fontWeight` | `var(--openkk-font-weight-semibold, 600)` |
| `--openkk-typography-meta-font-size` | `typography.meta.fontSize` | `var(--openkk-font-size-xs, 11px)` |
| `--openkk-typography-meta-line-height` | `typography.meta.lineHeight` | `1.45` |
| `--openkk-typography-meta-font-weight` | `typography.meta.fontWeight` | `var(--openkk-font-weight-medium, 500)` |
| `--openkk-typography-helper-font-size` | `typography.helper.fontSize` | `var(--openkk-font-size-sm, 12px)` |
| `--openkk-typography-helper-line-height` | `typography.helper.lineHeight` | `1.6` |
| `--openkk-typography-helper-font-weight` | `typography.helper.fontWeight` | `var(--openkk-font-weight-regular, 400)` |
| `--openkk-typography-body-font-size` | `typography.body.fontSize` | `var(--openkk-font-size-base, 13px)` |
| `--openkk-typography-body-line-height` | `typography.body.lineHeight` | `1.7` |
| `--openkk-typography-body-font-weight` | `typography.body.fontWeight` | `var(--openkk-font-weight-regular, 400)` |
| `--openkk-typography-input-font-size` | `typography.input.fontSize` | `var(--openkk-font-size-md, 14px)` |
| `--openkk-typography-input-line-height` | `typography.input.lineHeight` | `1.45` |
| `--openkk-typography-input-font-weight` | `typography.input.fontWeight` | `var(--openkk-font-weight-regular, 400)` |
| `--openkk-typography-label-font-size` | `typography.label.fontSize` | `var(--openkk-font-size-sm, 12px)` |
| `--openkk-typography-label-line-height` | `typography.label.lineHeight` | `1.4` |
| `--openkk-typography-label-font-weight` | `typography.label.fontWeight` | `var(--openkk-font-weight-semibold, 600)` |
| `--openkk-typography-control-font-size` | `typography.control.fontSize` | `var(--openkk-font-size-base, 13px)` |
| `--openkk-typography-control-line-height` | `typography.control.lineHeight` | `1.4` |
| `--openkk-typography-control-font-weight` | `typography.control.fontWeight` | `var(--openkk-font-weight-semibold, 600)` |
| `--openkk-typography-amount-font-size` | `typography.amount.fontSize` | `var(--openkk-font-size-base, 13px)` |
| `--openkk-typography-amount-line-height` | `typography.amount.lineHeight` | `1.4` |
| `--openkk-typography-amount-font-weight` | `typography.amount.fontWeight` | `var(--openkk-font-weight-semibold, 600)` |
| `--openkk-typography-amount-font-family` | `typography.amount.fontFamily` | `var(--openkk-font-family-mono, var(--font-mono), "Noto Sans Mono", ui-monospace, monospace)` |
| `--openkk-typography-chip-font-size` | `typography.chip.fontSize` | `var(--openkk-font-size-sm, 12px)` |
| `--openkk-typography-chip-line-height` | `typography.chip.lineHeight` | `1.35` |
| `--openkk-typography-chip-font-weight` | `typography.chip.fontWeight` | `var(--openkk-font-weight-regular, 400)` |
| `--openkk-typography-account-label-font-size` | `typography.accountLabel.fontSize` | `var(--openkk-font-size-base, 13px)` |
| `--openkk-typography-account-label-line-height` | `typography.accountLabel.lineHeight` | `1.35` |
| `--openkk-typography-account-label-font-weight` | `typography.accountLabel.fontWeight` | `var(--openkk-font-weight-bold, 700)` |
| `--openkk-typography-section-title-font-size` | `typography.sectionTitle.fontSize` | `var(--openkk-font-size-lg, 15px)` |
| `--openkk-typography-section-title-line-height` | `typography.sectionTitle.lineHeight` | `1.45` |
| `--openkk-typography-section-title-font-weight` | `typography.sectionTitle.fontWeight` | `var(--openkk-font-weight-bold, 700)` |
| `--openkk-typography-content-title-font-size` | `typography.contentTitle.fontSize` | `var(--openkk-font-size-xl, 18px)` |
| `--openkk-typography-content-title-line-height` | `typography.contentTitle.lineHeight` | `1.4` |
| `--openkk-typography-content-title-font-weight` | `typography.contentTitle.fontWeight` | `var(--openkk-font-weight-bold, 700)` |
| `--openkk-typography-dialog-title-font-size` | `typography.dialogTitle.fontSize` | `20px` |
| `--openkk-typography-dialog-title-line-height` | `typography.dialogTitle.lineHeight` | `1.3` |
| `--openkk-typography-dialog-title-font-weight` | `typography.dialogTitle.fontWeight` | `var(--openkk-font-weight-bold, 700)` |
| `--openkk-typography-page-title-font-size` | `typography.pageTitle.fontSize` | `24px` |
| `--openkk-typography-page-title-line-height` | `typography.pageTitle.lineHeight` | `1.25` |
| `--openkk-typography-page-title-font-weight` | `typography.pageTitle.fontWeight` | `var(--openkk-font-weight-bold, 700)` |
