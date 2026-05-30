import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  spacing,
  typography,
} from "../../../shared/design-tokens";
import { DocumentFileList } from "../../../shared/document-file-tile";

type InventoryItem = {
  name: string;
  current: string;
  where: string;
  review: string;
  status: "stable" | "mixed" | "risk";
};

type ProposedToken = {
  name: string;
  value: string;
  purpose: string;
  examples: string[];
};

const touchReferences = [
  {
    name: "Material Design",
    value: "48dp",
    note: "touch target は 48dp を基準。compact UI でも実タップ領域は確保する考え方。",
  },
  {
    name: "Apple HIG",
    value: "44pt",
    note: "押せる領域は 44pt 四方を基準。見た目のボタンが小さくても hit area を広げる。",
  },
  {
    name: "Carbon",
    value: "2px / 8px 系 scale",
    note: "UI 密度を保つため、細かい差分を scale 化して任意値を増やさない。",
  },
] as const;

const spacingInventory: InventoryItem[] = [
  {
    name: "Page Padding",
    current: "24 / 32 / 40px",
    where: "debug, ideas, steps, assist",
    review:
      "24px が中心。ideas には 32/40px もあり、比較画面由来の余白が残る。",
    status: "mixed",
  },
  {
    name: "Card Padding",
    current: "14 / 16 / 18 / 20 / 24 / 32px",
    where: "debug cards, assist cards, empty state",
    review: "14/18px が中途半端に見える。16/20/24px へ整理できそう。",
    status: "mixed",
  },
  {
    name: "Inline Gap",
    current: "4 / 6 / 8 / 10 / 12 / 14 / 16 / 20px",
    where: "buttons, labels, forms, step rows",
    review:
      "2px grid には沿っているが、10/14px は用途を限定しないと増殖しやすい。",
    status: "mixed",
  },
  {
    name: "Row Gap",
    current: "12 / 14 / 16 / 18 / 20px",
    where: "steps, ideas, cards",
    review:
      "steps の markdown 的な読み物では 16/20px が自然。14/18px は統合候補。",
    status: "mixed",
  },
  {
    name: "Divider",
    current: "1px",
    where: "step sections, list separators, table borders",
    review: "一般的で違和感なし。色 token とセットで維持する。",
    status: "stable",
  },
];

const componentInventory: InventoryItem[] = [
  {
    name: "Primary / Secondary Button",
    current: "36 / 40 / 42 / 44px high",
    where: "steps actions, drawers, sign-in, ideas",
    review: "desktop は 36/40px、重要操作は 44px が自然。42px は整理候補。",
    status: "mixed",
  },
  {
    name: "Small Button / Pill",
    current: "20 / 22 / 24 / 30 / 32px high",
    where: "chart legend, status chip, tag chip, small controls",
    review:
      "20/22px は表示ラベルとしては可。button として使うなら hit area 補強が必要。",
    status: "risk",
  },
  {
    name: "Input Field",
    current: "36 / 40px high",
    where: "forms, drawer inputs, amount fields",
    review:
      "40px が実質標準。36px は compact form 用として分けるか統合したい。",
    status: "stable",
  },
  {
    name: "Icon Button",
    current: "22 / 24 / 26 / 28 / 30 / 48px",
    where: "stepper dot, sidebar, mobile topbar, ideas",
    review:
      "見た目サイズと hit area が混在。押せる icon は 36-44px wrapper を持つべき。",
    status: "risk",
  },
  {
    name: "Account Container",
    current: "table 36px high / inline 28px high",
    where: "entries, debug color-theme sample",
    review:
      "entries テーブル行の見た目として評価が高い。テーブル内 36px は維持し、inline 表示だけ 28px と分ける。",
    status: "stable",
  },
  {
    name: "Tag Chip",
    current: "30px high / pill radius",
    where: "entries tags, drawer tags",
    review: "entries 行内で勘定科目より弱く見える。30px は維持候補。",
    status: "stable",
  },
  {
    name: "Entries Table Row",
    current: "header 40px / row 52px",
    where: "entries table",
    review:
      "ユーザー評価が高いため、理想案でも基準寸法として扱う。ここを起点に他部品を合わせる。",
    status: "stable",
  },
  {
    name: "Drawer",
    current: "560px wide / header 52px / body padding 20px",
    where: "entry edit, fixed asset edit",
    review: "会計フォームとして妥当。幅 560px は desktop drawer の標準候補。",
    status: "stable",
  },
  {
    name: "Mobile Topbar",
    current: "48px high",
    where: "shell mobile",
    review: "Material の 48dp と整合。維持候補。",
    status: "stable",
  },
];

const radiusInventory: InventoryItem[] = [
  {
    name: "Small Control",
    current: "6 / 8px",
    where: "small buttons, inputs, compact cards",
    review: "6px は小型、8px は標準 control として自然。",
    status: "stable",
  },
  {
    name: "Card / Popup",
    current: "10 / 12 / 14 / 16 / 18px",
    where: "cards, debug samples, ideas",
    review:
      "10/12px は実アプリ標準。14/16/18px は preview 表現が中心で統合候補。",
    status: "mixed",
  },
  {
    name: "Pill",
    current: "999px",
    where: "tags, status, stepper dot",
    review: "pill 表現として明快。用途は chip / badge / dot に限定したい。",
    status: "stable",
  },
];

const buttonExamples = [
  {
    label: "テキスト",
    height: 36,
    padding: "0 16px",
    icon: false,
    chevron: false,
    note: "steps 標準 action",
  },
  {
    label: "アイコン + テキスト",
    height: 36,
    padding: "0 14px",
    icon: true,
    chevron: false,
    note: "sidebar / file / assist",
  },
  {
    label: "テキスト + ▼",
    height: 36,
    padding: "0 12px",
    icon: false,
    chevron: true,
    note: "period selector",
  },
  {
    label: "全入り",
    height: 40,
    padding: "0 14px",
    icon: true,
    chevron: true,
    note: "将来の select button 候補",
  },
  {
    label: "小型",
    height: 24,
    padding: "0 12px",
    icon: false,
    chevron: false,
    note: "表示 badge。button 化は注意",
  },
] as const;

const proposedSpacingTokens: ProposedToken[] = [
  {
    name: "space.0",
    value: "0px",
    purpose: "密着。意図的に余白を消す場合だけ。",
    examples: ["table cell grid", "divider と隣接する面"],
  },
  {
    name: "space.1",
    value: "4px",
    purpose: "アイコンと短いラベル、badge 内の微調整。",
    examples: ["icon-label gap", "chart legend 内部"],
  },
  {
    name: "space.2",
    value: "8px",
    purpose: "標準の inline gap。フォーム label と input の間。",
    examples: ["button icon gap", "label-field gap", "tag 間隔"],
  },
  {
    name: "space.3",
    value: "12px",
    purpose: "compact block gap。entries テーブル周辺や小カード内。",
    examples: [
      "entries cell horizontal padding",
      "menu padding",
      "compact card padding",
    ],
  },
  {
    name: "space.4",
    value: "16px",
    purpose: "標準 block gap / card padding。最も使う基本余白。",
    examples: ["card padding", "section inner gap", "button group gap"],
  },
  {
    name: "space.5",
    value: "20px",
    purpose: "drawer / form body の余白。入力が並ぶ領域を少し広く取る。",
    examples: ["drawer body padding", "form section gap"],
  },
  {
    name: "space.6",
    value: "24px",
    purpose: "page padding / 大きめ section gap。",
    examples: ["page padding", "debug page padding", "steps page padding"],
  },
  {
    name: "space.7",
    value: "32px",
    purpose: "empty state / 大きなまとまりの区切り。",
    examples: ["empty state padding", "hero-like debug section"],
  },
  {
    name: "space.8",
    value: "40px",
    purpose: "例外的な大余白。ページ先頭や比較画面のみに限定。",
    examples: ["ideas overview", "landing-like preview"],
  },
];

const proposedComponentTokens: ProposedToken[] = [
  {
    name: "control.badge",
    value: "24px high",
    purpose: "表示専用 badge / status。原則クリック対象にしない。",
    examples: ["期間状態", "小さな chart legend", "readonly status"],
  },
  {
    name: "control.chip",
    value: "30px high",
    purpose: "タグチップ。entries の現状を維持し、勘定科目より軽く見せる。",
    examples: ["取引先", "事業割合", "freeform tag"],
  },
  {
    name: "control.accountInline",
    value: "28px high",
    purpose: "テーブル外の勘定科目ミニ表示。entries 行内とは分ける。",
    examples: ["inline account chip", "小さな説明内の科目"],
  },
  {
    name: "control.compact",
    value: "36px high",
    purpose:
      "desktop の密度高めの標準ボタン、および entries テーブル内の勘定科目コンテナ。",
    examples: ["詳細", "追加", "entries account cell", "steps footer button"],
  },
  {
    name: "control.field",
    value: "40px high",
    purpose: "入力欄、select-like control、フォーム用ボタンの共通高さ。",
    examples: ["text input", "amount input", "キャンセル", "保存する"],
  },
  {
    name: "control.prominent",
    value: "44px high",
    purpose: "単独 CTA 専用。フォーム保存や通常操作には使わない。",
    examples: ["サインイン", "開始する", "mobile primary"],
  },
  {
    name: "control.touch",
    value: "48px hit area",
    purpose: "mobile topbar や icon-only button の最小 hit area。",
    examples: ["hamburger", "mobile nav", "icon-only action"],
  },
  {
    name: "icon.sm / md / lg",
    value: "14 / 16 / 20px",
    purpose: "アイコン自体の描画サイズ。button の hit area とは分ける。",
    examples: ["inline icon", "button icon", "empty state icon"],
  },
  {
    name: "drawer.md",
    value: "560px wide",
    purpose: "会計フォーム drawer の標準幅。",
    examples: ["仕訳編集", "固定資産編集"],
  },
];

const proposedLayoutTokens: ProposedToken[] = [
  {
    name: "shell.sidebar",
    value: "216px wide",
    purpose: "常設サイドバー。ナビ、期間切替、アカウント領域を収める最小幅。",
    examples: ["desktop sidebar", "mobile drawer base"],
  },
  {
    name: "shell.mobileTopbar",
    value: "48px high",
    purpose: "mobile 上部バー。Material 48dp と整合する touch-safe な高さ。",
    examples: ["hamburger", "mobile app title"],
  },
  {
    name: "content.reading",
    value: "720px max",
    purpose: "steps / assist の読み物コンテンツ。1 行が長くなりすぎない幅。",
    examples: ["steps docs", "assist overview"],
  },
  {
    name: "content.form",
    value: "560-880px max",
    purpose: "フォーム画面。単一フォームは 560px、複数 section は 880px まで。",
    examples: ["fiscal-periods/new", "settings form"],
  },
  {
    name: "content.controlBar",
    value: "960px max",
    purpose:
      "steps footer や横並び操作の上限。読み物より広く、データ画面より狭い。",
    examples: ["steps footer", "analytics controls"],
  },
  {
    name: "content.data",
    value: "1360px max",
    purpose: "entries など横幅を必要とするデータ画面。",
    examples: ["entries table", "assist list"],
  },
  {
    name: "content.debug",
    value: "1160px max",
    purpose: "debug / design preview。比較部品を横並びで見せる確認用幅。",
    examples: ["color theme", "layout sizes"],
  },
  {
    name: "page.padding",
    value: "24px",
    purpose:
      "通常ページの外側余白。desktop でも mobile でも過剰に広げない基本値。",
    examples: ["entries", "debug", "assist"],
  },
];

const proposedFormTokens: ProposedToken[] = [
  {
    name: "form.fieldHeight",
    value: "40px",
    purpose: "入力欄の標準高さ。テキスト入力、金額入力、日付入力を揃える。",
    examples: ["text input", "amount input", "date button"],
  },
  {
    name: "form.fieldPaddingX",
    value: "12px",
    purpose: "入力欄の左右 padding。13-14px 文字と相性がよい。",
    examples: ["text input", "readonly value"],
  },
  {
    name: "form.labelGap",
    value: "8px",
    purpose: "label から control までの距離。近すぎず、関連性を保つ。",
    examples: ["FormField", "StepFormRow"],
  },
  {
    name: "form.helpGap",
    value: "12px",
    purpose:
      "control から help/error までの距離。入力欄の一部ではなく補足として読ませる。",
    examples: ["help text", "error text"],
  },
  {
    name: "form.stackGap",
    value: "28px",
    purpose: "フォーム項目間の距離。40px field と組み合わせて読みやすい。",
    examples: ["FormStack", "settings form"],
  },
  {
    name: "form.actionsGap",
    value: "10px",
    purpose: "保存・キャンセルなど action group 内の間隔。",
    examples: ["FormActions", "drawer footer"],
  },
];

const proposedRadiusTokens: ProposedToken[] = [
  {
    name: "radius.xs",
    value: "6px",
    purpose: "小型 badge / compact control。",
    examples: ["small legend", "tiny icon surface"],
  },
  {
    name: "radius.sm",
    value: "8px",
    purpose: "標準 control。入力欄とボタンの基本。",
    examples: ["button", "input", "select"],
  },
  {
    name: "radius.md",
    value: "10px",
    purpose:
      "popup / table outer。entries の account container は現状の 8px を優先。",
    examples: ["dropdown", "table", "compact card"],
  },
  {
    name: "radius.lg",
    value: "12px",
    purpose: "card / drawer section。",
    examples: ["main card", "debug card", "form group"],
  },
  {
    name: "radius.pill",
    value: "999px",
    purpose: "pill chip / status / circular dot。",
    examples: ["tag chip", "status badge", "step dot"],
  },
];

const proposedButtonExamples = [
  {
    label: "Badge",
    height: 24,
    minWidth: 0,
    padding: "0 8px",
    icon: false,
    chevron: false,
    tone: "neutral",
    purpose: "表示専用",
  },
  {
    label: "タグ",
    height: 30,
    minWidth: 0,
    padding: "0 10px",
    icon: false,
    chevron: false,
    tone: "neutral",
    purpose: "chip",
  },
  {
    label: "売上高",
    height: sizes.account.tableHeight,
    minWidth: sizes.account.tableWidth,
    padding: "0 11px",
    icon: true,
    chevron: false,
    tone: "neutral",
    purpose: "entries account",
  },
  {
    label: "詳細",
    height: sizes.button.compactHeight,
    minWidth: sizes.button.compactMinWidth,
    padding: "0 14px",
    icon: false,
    chevron: false,
    tone: "neutral",
    purpose: "compact",
  },
  {
    label: "追加",
    height: sizes.button.compactHeight,
    minWidth: sizes.button.compactIconTextMinWidth,
    padding: "0 12px",
    icon: true,
    chevron: false,
    tone: "action",
    purpose: "icon + text",
  },
  {
    label: "期間",
    height: sizes.field.height,
    minWidth: sizes.button.formSecondaryMinWidth,
    padding: "0 12px",
    icon: false,
    chevron: true,
    tone: "neutral",
    purpose: "select-like",
  },
  {
    label: "キャンセル",
    height: sizes.button.formHeight,
    minWidth: sizes.button.formSecondaryMinWidth,
    padding: "0 16px",
    icon: false,
    chevron: false,
    tone: "actionOutline",
    purpose: "form secondary",
  },
  {
    label: "保存する",
    height: sizes.button.formHeight,
    minWidth: sizes.button.formPrimaryMinWidth,
    padding: "0 18px",
    icon: false,
    chevron: false,
    tone: "decision",
    purpose: "form primary",
  },
  {
    label: "サインイン",
    height: sizes.button.ctaHeight,
    minWidth: sizes.button.ctaMinWidth,
    padding: "0 20px",
    icon: false,
    chevron: false,
    tone: "decision",
    purpose: "standalone CTA",
  },
] as const;

const proposedButtonTokens: ProposedToken[] = [
  {
    name: "button.compact",
    value: "36px high / min 72px",
    purpose: "一覧・ツールバー内の軽い操作。データ密度を優先する標準小ボタン。",
    examples: ["詳細", "追加", "絞り込み"],
  },
  {
    name: "button.form",
    value: "40px high / min 88-96px",
    purpose:
      "入力フォームや drawer footer の標準ボタン。secondary / primary / danger で同じ寸法を使う。",
    examples: ["キャンセル + 保存する", "戻る + 確定"],
  },
  {
    name: "button.cta",
    value: "44px high / min 112px",
    purpose: "単独 CTA 専用。画面の主目的を 1 つだけ強く見せる場面で使う。",
    examples: ["サインイン", "開始する"],
  },
  {
    name: "button.iconOnly",
    value: "36px box / mobile 44-48px hit area",
    purpose:
      "アイコンだけの操作。描画アイコン 16-20px とクリック領域を分けて管理する。",
    examples: ["hamburger", "more", "close"],
  },
];

export function LayoutSizesPage() {
  if (false) {
    return (
      <section style={{ padding: spacing.s24 }}>
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            color: palette.textSoft,
            fontWeight: fontWeight.semibold,
          }}
        >
          この画面は dev 環境専用です
        </div>
      </section>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: palette.pageBg,
        color: palette.text,
        padding: spacing.s24,
      }}
    >
      <div style={{ maxWidth: sizes.content.debugMaxWidth, margin: "0 auto" }}>
        <Link
          href="/debug"
          style={{ ...typography.control, color: palette.action }}
        >
          ← debug
        </Link>

        <header style={{ marginTop: spacing.s16, marginBottom: spacing.s24 }}>
          <div
            style={{
              ...typography.meta,
              color: palette.textLabel,
              letterSpacing: "0.08em",
            }}
          >
            LAYOUT SIZE INVENTORY / PROPOSAL
          </div>
          <h1 style={{ ...typography.pageTitle, margin: "6px 0 0" }}>
            OpenKK Layout Sizes
          </h1>
          <p
            style={{
              ...typography.body,
              maxWidth: 860,
              margin: "10px 0 0",
              color: palette.textSoft,
            }}
          >
            既存 UI の寸法棚卸しと、一般的な touch target / spacing scale
            を踏まえた理想設計案です。 entries
            テーブル行は既存の見た目が評価されているため、理想案でも基準寸法として維持します。
            まだ採用 token
            ではなく、次の段階でこの案を実アプリへ適用するか判断します。
          </p>
        </header>

        <Section
          title="Reference"
          lead="視認性とクリックしやすさの比較基準。OpenKK は desktop 業務 UI ですが、mobile / touch も考慮します。"
        >
          <div style={gridStyle}>
            {touchReferences.map((item) => (
              <Card key={item.name}>
                <div style={{ ...typography.sectionTitle }}>{item.name}</div>
                <div
                  style={{
                    marginTop: spacing.s8,
                    ...typography.dialogTitle,
                    color: palette.action,
                  }}
                >
                  {item.value}
                </div>
                <p
                  style={{
                    ...typography.body,
                    color: palette.textSoft,
                    margin: "8px 0 0",
                  }}
                >
                  {item.note}
                </p>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          title="Current Spacing"
          lead="余白・gap・divider の現状。2px グリッドには概ね乗っていますが、近い値が多い状態です。"
        >
          <InventoryTable items={spacingInventory} />
        </Section>

        <Section
          title="Current Components"
          lead="ボタン、入力、chip、drawer など主要 UI 部品の寸法。"
        >
          <InventoryTable items={componentInventory} />
        </Section>

        <Section
          title="Current Radius"
          lead="角丸の現状。小型 control と card の境界が少し曖昧です。"
        >
          <InventoryTable items={radiusInventory} />
        </Section>

        <Section
          title="Button Variations"
          lead="テキスト・アイコン・下向きマークの組み合わせを、現状よく使う高さで並べます。"
        >
          <Card>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: spacing.s12,
                alignItems: "flex-start",
              }}
            >
              {buttonExamples.map((button) => (
                <div
                  key={button.label}
                  style={{ display: "grid", gap: spacing.s8 }}
                >
                  <button
                    style={{
                      height: button.height,
                      padding: button.padding,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: spacing.s8,
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.borderStrong}`,
                      background: palette.surface,
                      color: palette.text,
                      ...typography.control,
                    }}
                  >
                    {button.icon ? <span style={iconBoxStyle}>□</span> : null}
                    <span>{button.label}</span>
                    {button.chevron ? (
                      <span style={{ color: palette.textLabel }}>▼</span>
                    ) : null}
                  </button>
                  <div
                    style={{
                      ...typography.helper,
                      color: palette.textSoft,
                      maxWidth: 160,
                    }}
                  >
                    {button.height}px / {button.note}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section
          title="Proposed Spacing Tokens"
          lead="理想案。既存の 14/18px など近い値を減らし、4px grid を基本にして用途で選びます。"
        >
          <TokenGrid tokens={proposedSpacingTokens} />
        </Section>

        <Section
          title="Proposed Component Sizes"
          lead="理想案。entries テーブルの密度を基準にし、見た目の高さと hit area を分けます。"
        >
          <TokenGrid tokens={proposedComponentTokens} />
        </Section>

        <Section
          title="Proposed Layout Tokens"
          lead="画面全体の理想案。読み物・フォーム・データ画面で max-width を分け、entries は広いデータ領域として扱います。"
        >
          <TokenGrid tokens={proposedLayoutTokens} />
        </Section>

        <Section
          title="Proposed Form Tokens"
          lead="フォーム関連の理想案。既存 FormTextInput / AmountInput の 40px 系を正式な基準にします。"
        >
          <TokenGrid tokens={proposedFormTokens} />
        </Section>

        <Section
          title="Proposed Radius Tokens"
          lead="理想案。角丸は 5 種類に絞り、card と control の役割差を明確にします。"
        >
          <TokenGrid tokens={proposedRadiusTokens} />
        </Section>

        <Section
          title="Proposed Button System"
          lead="理想案。ボタンの中身が増えても高さと padding のルールが崩れないようにします。"
        >
          <Card>
            <div style={{ display: "grid", gap: spacing.s16 }}>
              <TokenGrid tokens={proposedButtonTokens} />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: spacing.s12,
                  alignItems: "flex-start",
                }}
              >
                {proposedButtonExamples.map((button) => (
                  <div
                    key={`${button.label}-${button.height}`}
                    style={{ display: "grid", gap: spacing.s8 }}
                  >
                    <button
                      style={{
                        height: button.height,
                        minWidth: button.minWidth || undefined,
                        padding: button.padding,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: spacing.s8,
                        borderRadius:
                          button.height <= 30 ? radii.pill : radii.sm,
                        border:
                          button.tone === "decision"
                            ? "none"
                            : `1px solid ${button.tone === "actionOutline" ? palette.actionBorder : palette.borderStrong}`,
                        background:
                          button.tone === "decision"
                            ? palette.decision
                            : palette.surface,
                        color:
                          button.tone === "decision"
                            ? palette.textOnDark
                            : button.tone === "actionOutline" ||
                                button.tone === "action"
                              ? palette.action
                              : palette.text,
                        ...typography.control,
                        ...(button.height <= 30 ? typography.chip : null),
                      }}
                    >
                      {button.icon ? <span style={iconBoxStyle}>□</span> : null}
                      <span>{button.label}</span>
                      {button.chevron ? (
                        <span style={{ color: palette.textLabel }}>▼</span>
                      ) : null}
                    </button>
                    <div
                      style={{
                        ...typography.helper,
                        color: palette.textSoft,
                        maxWidth: 160,
                      }}
                    >
                      {button.height}px / {button.purpose}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ ...typography.body, color: palette.textSoft }}>
                ボタンサイズは `compact / form / cta / iconOnly` の 4
                種類に絞ります。重要度は height ではなく、fill / border / color
                / min-width で表現します。 icon-only は見た目 16-20px
                でも、button wrapper は desktop 36px / mobile 44-48px
                を確保します。
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Document Receive Pattern"
          lead="steps/document-receive / closing で使う採用済みの書類受け取りリスト。外枠付き白カード + 行区切り + 黒ドキュメントアイコン + token 化された compact button。"
        >
          <Card>
            <div style={{ maxWidth: 640 }}>
              <DocumentFileList
                items={[
                  { label: "仕訳帳.pdf" },
                  { label: "総勘定元帳.pdf" },
                  { label: "財務諸表.pdf" },
                ]}
              />
            </div>
          </Card>
        </Section>

        <Section
          title="Proposed Shell Layout"
          lead="画面全体のサイズ感を大きめに再現します。sidebar 216px、mobile topbar 48px、data content 1360px の関係を確認します。"
        >
          <Card>
            <div style={{ display: "grid", gap: spacing.s20 }}>
              <div style={desktopShellPreviewStyle}>
                <aside style={previewSidebarStyle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: spacing.s10,
                      padding: `${spacing.s14}px ${spacing.s12}px ${spacing.s8}px`,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: radii.sm,
                        background: palette.brandInk,
                      }}
                    />
                    <div>
                      <div
                        style={{ ...typography.control, color: palette.text }}
                      >
                        オープン会計
                      </div>
                      <div
                        style={{ ...typography.meta, color: palette.textLabel }}
                      >
                        Dev環境
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: spacing.s8,
                      display: "grid",
                      gap: spacing.s4,
                    }}
                  >
                    {["手順", "仕訳", "補助"].map((item, index) => (
                      <div
                        key={item}
                        style={{
                          height: 36,
                          display: "flex",
                          alignItems: "center",
                          gap: spacing.s10,
                          padding: `0 ${spacing.s12}px`,
                          borderRadius: radii.sm,
                          background:
                            index === 1 ? palette.surfaceTint : "transparent",
                          color: index === 1 ? palette.text : palette.textSoft,
                          ...typography.control,
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: palette.borderStrong,
                          }}
                        />
                        {item}
                      </div>
                    ))}
                  </div>
                </aside>
                <section style={previewDataContentStyle}>
                  <div style={{ ...typography.meta, color: palette.textLabel }}>
                    content.data / max 1360
                  </div>
                  <div
                    style={{
                      ...typography.contentTitle,
                      marginTop: spacing.s4,
                    }}
                  >
                    仕訳
                  </div>
                  <div
                    style={{
                      marginTop: spacing.s16,
                      border: `1px solid ${palette.borderSubtle}`,
                      borderRadius: radii.md,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: 40,
                        background: palette.headerSurface,
                        display: "grid",
                        gridTemplateColumns: "80px 1fr 120px",
                        alignItems: "center",
                      }}
                    >
                      {["日付", "内容", "金額"].map((label) => (
                        <div
                          key={label}
                          style={{
                            padding: `0 ${spacing.s12}px`,
                            ...typography.label,
                            color: palette.textLabel,
                          }}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        height: 52,
                        display: "grid",
                        gridTemplateColumns: "80px 1fr 120px",
                        alignItems: "center",
                        borderTop: `1px solid ${palette.borderSubtle}`,
                      }}
                    >
                      <div
                        style={{
                          padding: `0 ${spacing.s12}px`,
                          ...typography.body,
                        }}
                      >
                        05/21
                      </div>
                      <div style={{ padding: `0 ${spacing.s8}px` }}>
                        <span style={idealAccountStyle}>売上高</span>
                        <span style={idealChipStyle}>取引先</span>
                      </div>
                      <div
                        style={{
                          padding: `0 ${spacing.s12}px`,
                          textAlign: "right",
                          ...typography.amount,
                        }}
                      >
                        88,000
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(260px, 360px) 1fr",
                  gap: spacing.s16,
                  alignItems: "start",
                }}
              >
                <div style={mobileShellPreviewStyle}>
                  <div
                    style={{
                      height: 48,
                      display: "flex",
                      alignItems: "center",
                      gap: spacing.s12,
                      padding: `0 ${spacing.s12}px`,
                      borderBottom: `1px solid ${palette.borderSubtle}`,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: radii.sm,
                        border: `1px solid ${palette.borderSubtle}`,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      ☰
                    </div>
                    <div style={{ ...typography.control }}>オープン会計</div>
                  </div>
                  <div style={{ padding: spacing.s16 }}>
                    <div
                      style={{ ...typography.meta, color: palette.textLabel }}
                    >
                      mobile topbar / 48px
                    </div>
                    <div
                      style={{
                        marginTop: spacing.s8,
                        ...typography.body,
                        color: palette.textSoft,
                      }}
                    >
                      icon-only は 40px 表示でも、topbar 自体は 48px の
                      touch-safe な高さを持ちます。
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: spacing.s12 }}>
                  <WidthBar label="sidebar" value="216px" width={216} />
                  <WidthBar label="reading content" value="720px" width={360} />
                  <WidthBar label="control bar" value="960px" width={480} />
                  <WidthBar label="data content" value="1360px" width={680} />
                </div>
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Proposed Form Layout"
          lead="入力フォーム関連を大きめに再現します。40px field、label gap 8px、help gap 12px、stack gap 28px を基準にします。"
        >
          <Card>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 560px) minmax(280px, 1fr)",
                gap: spacing.s24,
              }}
            >
              <div>
                <div style={{ ...typography.sectionTitle }}>
                  Single Column Form / 560px
                </div>
                <div
                  style={{
                    marginTop: spacing.s16,
                    width: "min(100%, 560px)",
                    display: "grid",
                    gap: 28,
                  }}
                >
                  <FormPreviewField
                    label="期間の名称"
                    value="2026年分"
                    help="単一フォームは 560px を上限にして、入力位置を読みやすくします。"
                  />
                  <FormPreviewField
                    label="摘要"
                    value="5月分 売上入金"
                    help="入力欄は 40px、左右 padding は 12px。"
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: spacing.s10,
                      marginTop: spacing.s12,
                    }}
                  >
                    <button style={idealSecondaryButtonStyle}>
                      キャンセル
                    </button>
                    <button style={idealProminentButtonStyle}>保存する</button>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ ...typography.sectionTitle }}>
                  Drawer Form / 560px
                </div>
                <div
                  style={{
                    marginTop: spacing.s16,
                    width: "min(100%, 560px)",
                    border: `1px solid ${palette.borderSubtle}`,
                    borderRadius: radii.lg,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: 52,
                      padding: `0 ${spacing.s20}px`,
                      display: "flex",
                      alignItems: "center",
                      borderBottom: `1px solid ${palette.borderSubtle}`,
                    }}
                  >
                    <span style={{ ...typography.sectionTitle }}>
                      取引の編集
                    </span>
                  </div>
                  <div
                    style={{
                      padding: spacing.s20,
                      display: "grid",
                      gap: spacing.s16,
                    }}
                  >
                    <FormPreviewField label="取引日" value="2026-05-21" />
                    <FormPreviewField label="金額" value="88,000" />
                    <p
                      style={{
                        margin: `${spacing.s12}px 0 0`,
                        ...typography.helper,
                        color: palette.textSoft,
                      }}
                    >
                      Drawer は幅 560px、header 52px、body padding 20px
                      を標準候補にします。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Proposed Application Sample"
          lead="理想寸法を仮適用した場合の見え方。entries 行は現状維持寄り、周辺フォームだけ整理しています。"
        >
          <Card>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(300px, 0.9fr) minmax(380px, 1.1fr)",
                gap: spacing.s24,
              }}
            >
              <div>
                <div style={{ ...typography.sectionTitle }}>Form / Drawer</div>
                <div
                  style={{
                    marginTop: spacing.s16,
                    border: `1px solid ${palette.borderSubtle}`,
                    borderRadius: radii.lg,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: 52,
                      padding: `0 ${spacing.s20}px`,
                      display: "flex",
                      alignItems: "center",
                      borderBottom: `1px solid ${palette.borderSubtle}`,
                    }}
                  >
                    <span style={{ ...typography.sectionTitle }}>
                      取引の編集
                    </span>
                  </div>
                  <div
                    style={{
                      padding: spacing.s20,
                      display: "grid",
                      gap: spacing.s16,
                    }}
                  >
                    <label style={{ display: "grid", gap: spacing.s8 }}>
                      <span
                        style={{
                          ...typography.label,
                          color: palette.textLabel,
                        }}
                      >
                        摘要
                      </span>
                      <input
                        readOnly
                        value="5月分 売上入金"
                        style={idealInputStyle}
                      />
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: spacing.s8,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button style={idealSecondaryButtonStyle}>
                        キャンセル
                      </button>
                      <button style={idealProminentButtonStyle}>
                        保存する
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ ...typography.sectionTitle }}>Entries Row</div>
                <div
                  style={{
                    marginTop: spacing.s16,
                    border: `1px solid ${palette.borderSubtle}`,
                    borderRadius: radii.md,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 112px",
                      height: 40,
                      background: palette.headerSurface,
                      alignItems: "center",
                    }}
                  >
                    {["日付", "内容", "金額"].map((label) => (
                      <div
                        key={label}
                        style={{
                          padding: `0 ${spacing.s12}px`,
                          ...typography.label,
                          color: palette.textLabel,
                        }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 112px",
                      height: 52,
                      alignItems: "center",
                      borderTop: `1px solid ${palette.borderSubtle}`,
                    }}
                  >
                    <div
                      style={{
                        padding: `0 ${spacing.s12}px`,
                        ...typography.body,
                      }}
                    >
                      05/21
                    </div>
                    <div style={{ padding: `0 ${spacing.s8}px` }}>
                      <span style={idealAccountStyle}>売上高</span>
                      <span style={idealChipStyle}>取引先</span>
                    </div>
                    <div
                      style={{
                        padding: `0 ${spacing.s12}px`,
                        textAlign: "right",
                        ...typography.amount,
                      }}
                    >
                      88,000
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Size Samples"
          lead="実アプリに近い面・フォーム・テーブル・chip を、現在寸法のまま再現します。"
        >
          <Card>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(300px, 0.9fr) minmax(380px, 1.1fr)",
                gap: spacing.s20,
              }}
            >
              <div>
                <div style={{ ...typography.sectionTitle }}>Form / Drawer</div>
                <div
                  style={{
                    marginTop: spacing.s14,
                    border: `1px solid ${palette.borderSubtle}`,
                    borderRadius: radii.lg,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: 52,
                      padding: "0 20px",
                      display: "flex",
                      alignItems: "center",
                      borderBottom: `1px solid ${palette.borderSubtle}`,
                    }}
                  >
                    <span style={{ ...typography.sectionTitle }}>
                      取引の編集
                    </span>
                  </div>
                  <div
                    style={{
                      padding: spacing.s20,
                      display: "grid",
                      gap: spacing.s16,
                    }}
                  >
                    <label style={{ display: "grid", gap: spacing.s8 }}>
                      <span
                        style={{
                          ...typography.label,
                          color: palette.textLabel,
                        }}
                      >
                        摘要
                      </span>
                      <input
                        readOnly
                        value="5月分 売上入金"
                        style={inputStyle}
                      />
                    </label>
                    <button style={primaryButtonStyle}>保存する</button>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ ...typography.sectionTitle }}>Entries Row</div>
                <div
                  style={{
                    marginTop: spacing.s14,
                    border: `1px solid ${palette.borderSubtle}`,
                    borderRadius: radii.md,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 112px",
                      background: palette.headerSurface,
                    }}
                  >
                    {["日付", "内容", "金額"].map((label) => (
                      <div
                        key={label}
                        style={{
                          padding: "8px 10px",
                          ...typography.label,
                          color: palette.textLabel,
                        }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 112px",
                      alignItems: "center",
                      borderTop: `1px solid ${palette.borderSubtle}`,
                    }}
                  >
                    <div style={{ padding: spacing.s10, ...typography.body }}>
                      05/21
                    </div>
                    <div style={{ padding: spacing.s10 }}>
                      <span style={accountStyle}>売上高</span>
                      <span style={chipStyle}>取引先</span>
                    </div>
                    <div
                      style={{
                        padding: spacing.s10,
                        textAlign: "right",
                        ...typography.amount,
                      }}
                    >
                      88,000
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Design Decisions Draft"
          lead="今回の設計案です。まだ適用せず、次の段階で採用可否を判断します。"
        >
          <Card>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                ...typography.body,
                color: palette.textSoft,
              }}
            >
              <li style={{ margin: "6px 0" }}>
                entries テーブルは `header 40px / row 52px / account 36px / tag
                30px` を基準寸法として維持します。
              </li>
              <li style={{ margin: "6px 0" }}>
                ボタンは `button.compact 36px / button.form 40px / button.cta
                44px / button.iconOnly 36px`
                に絞ります。例外条件を増やさず、用途ごとに別サイズとして扱います。
              </li>
              <li style={{ margin: "6px 0" }}>
                保存・キャンセルのようなフォーム操作は常に `button.form`
                を使い、主従差は高さではなく塗り・枠線・文字色・最低横幅で表現します。
              </li>
              <li style={{ margin: "6px 0" }}>
                ボタンの最低横幅は `compact 72px / icon+text 88px / form primary
                96px / cta 112px` を基準にし、full-width は mobile または単独
                block CTA に限定します。
              </li>
              <li style={{ margin: "6px 0" }}>
                クリック可能な icon-only は見た目 icon size と hit area
                を分離し、desktop 36px / mobile 44-48px を守ります。
              </li>
              <li style={{ margin: "6px 0" }}>
                余白は `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40px`
                を主軸にしますが、entries 行内の既存 padding
                は見た目維持を優先して微調整に留めます。
              </li>
              <li style={{ margin: "6px 0" }}>
                radius は `6 / 8 / 10 / 12 / pill` に固定します。entries account
                の 8px は維持し、14px 以上の大きい角丸は preview / hero
                以外では避けます。
              </li>
              <li style={{ margin: "6px 0" }}>
                会計アプリとしての密度を優先しつつ、重要操作と mobile 操作は
                Apple 44pt / Material 48dp の考え方に寄せます。
              </li>
            </ul>
          </Card>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: spacing.s32 }}>
      <h2 style={{ ...typography.contentTitle, margin: 0 }}>{title}</h2>
      <p
        style={{
          ...typography.body,
          color: palette.textSoft,
          margin: "6px 0 14px",
        }}
      >
        {lead}
      </p>
      {children}
    </section>
  );
}

function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: palette.surface,
        border: `1px solid ${palette.borderSubtle}`,
        borderRadius: radii.lg,
        boxShadow: shadows.card,
        padding: spacing.s16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function InventoryTable({ items }: { items: InventoryItem[] }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 180px 180px 1fr 92px",
          background: palette.headerSurface,
        }}
      >
        {["項目", "現状", "使用箇所", "レビュー", "状態"].map((label) => (
          <div
            key={label}
            style={{
              padding: "10px 12px",
              ...typography.label,
              color: palette.textLabel,
            }}
          >
            {label}
          </div>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.name}
          style={{
            display: "grid",
            gridTemplateColumns: "160px 180px 180px 1fr 92px",
            borderTop: `1px solid ${palette.borderSubtle}`,
          }}
        >
          <div
            style={{
              padding: "12px",
              ...typography.control,
              color: palette.text,
            }}
          >
            {item.name}
          </div>
          <code
            style={{
              padding: "12px",
              fontFamily: "inherit",
              ...typography.body,
              color: palette.textSoft,
            }}
          >
            {item.current}
          </code>
          <div
            style={{
              padding: "12px",
              ...typography.helper,
              color: palette.textSoft,
            }}
          >
            {item.where}
          </div>
          <div
            style={{
              padding: "12px",
              ...typography.body,
              color: palette.textSoft,
            }}
          >
            {item.review}
          </div>
          <div style={{ padding: "12px" }}>
            <StatusBadge status={item.status} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function TokenGrid({ tokens }: { tokens: ProposedToken[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: spacing.s12,
      }}
    >
      {tokens.map((token) => (
        <Card key={token.name}>
          <div style={{ ...typography.sectionTitle }}>{token.name}</div>
          <code
            style={{
              display: "inline-flex",
              marginTop: spacing.s8,
              padding: "4px 8px",
              borderRadius: radii.xs,
              border: `1px solid ${palette.borderSubtle}`,
              background: palette.surfaceTint,
              color: palette.textSoft,
              ...typography.helper,
            }}
          >
            {token.value}
          </code>
          <p
            style={{
              ...typography.body,
              color: palette.textSoft,
              margin: "10px 0 0",
            }}
          >
            {token.purpose}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: spacing.s6,
              marginTop: spacing.s10,
            }}
          >
            {token.examples.map((example) => (
              <span key={example} style={miniChipStyle}>
                {example}
              </span>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: InventoryItem["status"] }) {
  const styleByStatus = {
    stable: {
      label: "安定",
      color: palette.success,
      bg: palette.successBg,
      border: palette.successBorder,
    },
    mixed: {
      label: "混在",
      color: palette.warning,
      bg: palette.warningBg,
      border: palette.warningBorder,
    },
    risk: {
      label: "要注意",
      color: palette.danger,
      bg: palette.dangerBg,
      border: palette.dangerBorder,
    },
  }[status];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: radii.pill,
        border: `1px solid ${styleByStatus.border}`,
        background: styleByStatus.bg,
        color: styleByStatus.color,
        ...typography.label,
      }}
    >
      {styleByStatus.label}
    </span>
  );
}

function WidthBar({
  label,
  value,
  width,
}: {
  label: string;
  value: string;
  width: number;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: spacing.s12,
          ...typography.helper,
          color: palette.textSoft,
        }}
      >
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div
        style={{
          marginTop: spacing.s4,
          height: 18,
          borderRadius: radii.pill,
          background: palette.surfaceTint,
          border: `1px solid ${palette.borderSubtle}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width,
            maxWidth: "100%",
            height: "100%",
            background: palette.actionBg,
            borderRight: `1px solid ${palette.actionBorder}`,
          }}
        />
      </div>
    </div>
  );
}

function FormPreviewField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <label style={{ display: "grid", gap: spacing.s8 }}>
      <span style={{ ...typography.label, color: palette.textLabel }}>
        {label}
      </span>
      <input readOnly value={value} style={idealInputStyle} />
      {help != null ? (
        <span
          style={{
            marginTop: spacing.s4,
            ...typography.helper,
            color: palette.textMuted,
          }}
        >
          {help}
        </span>
      ) : null}
    </label>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: spacing.s12,
};

const desktopShellPreviewStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "216px 1fr",
  minHeight: 360,
  border: `1px solid ${palette.borderSubtle}`,
  borderRadius: radii.lg,
  overflow: "hidden",
  background: palette.surface,
};

const previewSidebarStyle: CSSProperties = {
  width: sizes.shell.sidebarWidth,
  borderRight: `1px solid ${palette.borderHeavy}`,
  background: palette.chromeSurface,
};

const previewDataContentStyle: CSSProperties = {
  minWidth: 0,
  padding: spacing.s24,
  background: palette.pageBg,
};

const mobileShellPreviewStyle: CSSProperties = {
  border: `1px solid ${palette.borderSubtle}`,
  borderRadius: radii.lg,
  overflow: "hidden",
  background: palette.surface,
};

const iconBoxStyle: CSSProperties = {
  width: 16,
  height: 16,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: palette.textLabel,
  fontSize: fontSize.xs,
};

const inputStyle: CSSProperties = {
  height: 40,
  borderRadius: radii.sm,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.surface,
  padding: "0 12px",
  color: palette.text,
  fontFamily: "inherit",
  ...typography.input,
};

const primaryButtonStyle: CSSProperties = {
  height: 40,
  padding: "0 16px",
  borderRadius: radii.sm,
  border: "none",
  background: palette.action,
  color: palette.textOnDark,
  ...typography.control,
};

const accountStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: 112,
  minHeight: 28,
  padding: "0 10px",
  borderRadius: radii.sm,
  background: palette.accountRevenueBg,
  border: `1px solid ${palette.accountRevenueBorder}`,
  color: palette.accountRevenue,
  ...typography.accountLabel,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 30,
  marginLeft: spacing.s8,
  padding: "0 9px",
  borderRadius: radii.pill,
  background: palette.surfaceTint,
  border: `1px solid ${palette.borderSubtle}`,
  color: palette.textSoft,
  ...typography.chip,
};

const miniChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 24,
  padding: "0 8px",
  borderRadius: radii.pill,
  border: `1px solid ${palette.borderSubtle}`,
  background: palette.surfaceTint,
  color: palette.textSoft,
  ...typography.helper,
};

const idealInputStyle: CSSProperties = {
  height: sizes.field.height,
  borderRadius: radii.sm,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.surface,
  padding: `0 ${spacing.s12}px`,
  color: palette.text,
  fontFamily: "inherit",
  ...typography.input,
};

const idealSecondaryButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formSecondaryMinWidth,
  padding: `0 ${spacing.s16}px`,
  borderRadius: radii.sm,
  border: `1px solid ${palette.actionBorder}`,
  background: palette.surface,
  color: palette.action,
  ...typography.control,
};

const idealProminentButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formPrimaryMinWidth,
  padding: "0 18px",
  borderRadius: radii.sm,
  border: "none",
  background: palette.decision,
  color: palette.textOnDark,
  ...typography.control,
};

const idealAccountStyle: CSSProperties = {
  ...accountStyle,
  width: sizes.account.tableWidth,
  height: sizes.account.tableHeight,
  minHeight: sizes.account.tableHeight,
  padding: "0 11px",
  borderRadius: radii.sm,
};

const idealChipStyle: CSSProperties = {
  ...chipStyle,
  height: sizes.chip.height,
  marginLeft: spacing.s8,
};
