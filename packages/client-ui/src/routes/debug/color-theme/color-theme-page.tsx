import Link from "next/link";

import {
  fontSize,
  fontWeight,
  shadows,
  typography,
} from "../../../shared/design-tokens";

type PaletteToken = {
  group: string;
  name: string;
  value: string;
  purpose: string;
  examples: string[];
  preview?: "surface" | "border" | "button" | "message" | "text";
  fg?: string;
  bg?: string;
  border?: string;
};

type AppPalette = {
  page: string;
  surface: string;
  surfaceTint: string;
  surfaceHeader: string;
  borderSubtle: string;
  borderControl: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textLabel: string;
  textMuted: string;
  brandInk: string;
  brandPaper: string;
  action: string;
  actionHover: string;
  actionBackground: string;
  actionBorder: string;
  decision: string;
  decisionHover: string;
  decisionBackground: string;
  decisionBorder: string;
  success: string;
  successBackground: string;
  successBorder: string;
  warning: string;
  warningBackground: string;
  warningBorder: string;
  danger: string;
  dangerBackground: string;
  dangerBorder: string;
  accountAsset: string;
  accountAssetBackground: string;
  accountAssetBorder: string;
  accountLiability: string;
  accountLiabilityBackground: string;
  accountLiabilityBorder: string;
  accountEquity: string;
  accountEquityBackground: string;
  accountEquityBorder: string;
  accountRevenue: string;
  accountRevenueBackground: string;
  accountRevenueBorder: string;
  accountExpense: string;
  accountExpenseBackground: string;
  accountExpenseBorder: string;
  accountProfit: string;
  accountProfitBackground: string;
  accountProfitBorder: string;
  accountLoss: string;
  accountLossBackground: string;
  accountLossBorder: string;
};

const appPalette: AppPalette = {
  page: "#FFFFFF",
  surface: "#FFFFFF",

  surfaceTint: "#F6F9FC",

  surfaceHeader: "#EAF0F6",

  borderSubtle: "#E2E8F0",
  borderControl: "#CBD5E1",
  borderStrong: "#94A3B8",

  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textLabel: "#64748B",
  textMuted: "#94A3B8",

  brandInk: "#0F172A",
  brandPaper: "#FFFFFF",

  action: "#1D4ED8",
  actionHover: "#1E40AF",
  actionBackground: "#EEF5FF",
  actionBorder: "#93C5FD",

  decision: "#15803D",
  decisionHover: "#166534",
  decisionBackground: "#ECFDF3",
  decisionBorder: "#86EFAC",

  success: "#15803D",
  successBackground: "#ECFDF3",
  successBorder: "#86EFAC",

  warning: "#D97706",
  warningBackground: "#FFFBEB",
  warningBorder: "#FDE68A",

  danger: "#DC2626",
  dangerBackground: "#FEF2F2",
  dangerBorder: "#FECACA",

  accountAsset: "#2563EB",
  accountAssetBackground: "#EFF6FF",
  accountAssetBorder: "#BFDBFE",
  accountLiability: "#E11D48",
  accountLiabilityBackground: "#FFF1F2",
  accountLiabilityBorder: "#FDA4AF",
  accountEquity: "#15803D",
  accountEquityBackground: "#ECFDF3",
  accountEquityBorder: "#86EFAC",
  accountRevenue: "#15803D",
  accountRevenueBackground: "#ECFDF3",
  accountRevenueBorder: "#86EFAC",
  accountExpense: "#2563EB",
  accountExpenseBackground: "#EFF6FF",
  accountExpenseBorder: "#BFDBFE",
  accountProfit: "#15803D",
  accountProfitBackground: "#ECFDF3",
  accountProfitBorder: "#86EFAC",
  accountLoss: "#E11D48",
  accountLossBackground: "#FFF1F2",
  accountLossBorder: "#FDA4AF",
};

const paletteTokens: PaletteToken[] = [
  {
    group: "Canvas / Surface",
    name: "Page",
    value: appPalette.page,
    purpose: "画面全体の基本背景。現状に合わせて白を基準にする。",
    examples: ["/entries の作業面", "詳細 drawer 背景", "一覧ページの余白"],
    preview: "surface",
    border: appPalette.borderSubtle,
  },
  {
    group: "Canvas / Surface",
    name: "Surface",
    value: appPalette.surface,
    purpose: "カード、入力欄、ポップアップなど最上層の面。",
    examples: ["テーブル行", "入力フィールド", "dropdown menu"],
    preview: "surface",
    border: appPalette.borderSubtle,
  },
  {
    group: "Canvas / Surface",
    name: "Surface Tint",
    value: appPalette.surfaceTint,
    purpose: "フォームグループ、hover、弱いカードをまとめて受ける薄い塗り。",
    examples: ["フォームグループ", "hover row", "readonly 周辺"],
    preview: "surface",
    border: appPalette.borderSubtle,
  },
  {
    group: "Canvas / Surface",
    name: "Surface Header",
    value: appPalette.surfaceHeader,
    purpose: "テーブルヘッダー、非データ面、強めのラベル帯。",
    examples: ["仕訳一覧ヘッダー", "空テーブル面", "セクション見出し帯"],
    preview: "surface",
    border: appPalette.borderControl,
  },
  {
    group: "Border",
    name: "Border Subtle",
    value: appPalette.borderSubtle,
    purpose: "弱い枠と内部 divider。最も使用頻度が高い境界。",
    examples: ["dropdown", "readonly field", "行間 divider"],
    preview: "border",
    bg: appPalette.surface,
    border: appPalette.borderSubtle,
  },
  {
    group: "Border",
    name: "Border Control",
    value: appPalette.borderControl,
    purpose: "操作可能な入力欄の標準枠。",
    examples: ["text input", "select", "date picker button"],
    preview: "border",
    bg: appPalette.surfaceTint,
    border: appPalette.borderControl,
  },
  {
    group: "Border",
    name: "Border Strong",
    value: appPalette.borderStrong,
    purpose: "大領域の分離と強い外枠。常時見える境界。",
    examples: ["sidebar 境界", "table outer border", "main card"],
    preview: "border",
    bg: appPalette.page,
    border: appPalette.borderStrong,
  },
  {
    group: "Text",
    name: "Text Primary",
    value: appPalette.textPrimary,
    purpose: "主要テキスト。見出し、金額、入力値。",
    examples: ["ページ見出し", "金額", "仕訳行の主情報"],
    preview: "text",
    fg: appPalette.textPrimary,
  },
  {
    group: "Text",
    name: "Text Secondary",
    value: appPalette.textSecondary,
    purpose: "本文説明や二次情報。",
    examples: ["カード説明", "補足テキスト", "サブタイトル"],
    preview: "text",
    fg: appPalette.textSecondary,
  },
  {
    group: "Text",
    name: "Text Label",
    value: appPalette.textLabel,
    purpose: "ラベル、メタ情報、caption。",
    examples: ["フィールドラベル", "テーブルヘッダー文字", "日付 meta"],
    preview: "text",
    fg: appPalette.textLabel,
  },
  {
    group: "Text",
    name: "Text Muted",
    value: appPalette.textMuted,
    purpose: "disabled、placeholder、弱い補助。",
    examples: ["placeholder", "無効メニュー", "未選択表示"],
    preview: "text",
    fg: appPalette.textMuted,
  },
  {
    group: "Brand",
    name: "Brand Ink",
    value: appPalette.brandInk,
    purpose: "ロゴ、製品名、ブランド面。ボタン意味色には使わない。",
    examples: ["オープン会計ロゴ文字", "ブランドマーク", "デモ CTA の黒面"],
    preview: "surface",
    fg: appPalette.brandPaper,
    border: appPalette.brandInk,
  },
  {
    group: "Action",
    name: "Action",
    value: appPalette.action,
    purpose: "通常の主操作。保存、次へ、開く。",
    examples: ["保存する", "仕訳を追加", "リストを開く"],
    preview: "button",
    fg: appPalette.brandPaper,
    border: appPalette.action,
  },
  {
    group: "Action",
    name: "Action Background",
    value: appPalette.actionBackground,
    purpose: "コメント、情報、選択中の薄い背景。",
    examples: ["コメントフィールド背景", "active row", "情報 chip 背景"],
    preview: "message",
    fg: appPalette.action,
    border: appPalette.actionBorder,
  },
  {
    group: "Action",
    name: "Action Border",
    value: appPalette.actionBorder,
    purpose: "Action Background と組み合わせる固定境界色。",
    examples: ["情報メッセージ枠", "青 outline chip", "選択カード枠"],
    preview: "border",
    bg: appPalette.actionBackground,
    border: appPalette.actionBorder,
  },
  {
    group: "Decision",
    name: "Decision",
    value: appPalette.decision,
    purpose: "大きな決断・前進操作。完了、開始、確定。",
    examples: ["決算を確定", "開始する", "取り込みを実行"],
    preview: "button",
    fg: appPalette.brandPaper,
    border: appPalette.decision,
  },
  {
    group: "Success",
    name: "Success",
    value: appPalette.success,
    purpose: "成功状態、完了表示。",
    examples: ["完了 chip", "成功 toast", "チェック済み icon"],
    preview: "button",
    fg: appPalette.brandPaper,
    border: appPalette.success,
  },
  {
    group: "Success",
    name: "Success Background",
    value: appPalette.successBackground,
    purpose: "成功メッセージや完了 chip の背景。",
    examples: ["インポート完了 banner", "完了 status", "成功 notice"],
    preview: "message",
    fg: appPalette.success,
    border: appPalette.successBorder,
  },
  {
    group: "Warning",
    name: "Warning",
    value: appPalette.warning,
    purpose: "注意・確認待ち。破壊的ではない警告。",
    examples: ["未分類があります", "仮締め前の注意", "要確認 chip"],
    preview: "button",
    fg: appPalette.brandPaper,
    border: appPalette.warning,
  },
  {
    group: "Warning",
    name: "Warning Background",
    value: appPalette.warningBackground,
    purpose: "警告 message / sample data banner の背景。",
    examples: ["注意 banner", "サンプルデータ notice", "確認待ち row"],
    preview: "message",
    fg: appPalette.warning,
    border: appPalette.warningBorder,
  },
  {
    group: "Danger",
    name: "Danger",
    value: appPalette.danger,
    purpose: "危険・削除・エラー。",
    examples: ["削除する", "エラー icon", "破棄 action"],
    preview: "button",
    fg: appPalette.brandPaper,
    border: appPalette.danger,
  },
  {
    group: "Danger",
    name: "Danger Background",
    value: appPalette.dangerBackground,
    purpose: "エラーメッセージや削除確認の背景。",
    examples: ["エラー banner", "危険 notice", "削除確認 card"],
    preview: "message",
    fg: appPalette.danger,
    border: appPalette.dangerBorder,
  },
  {
    group: "Account Visual",
    name: "Account Asset",
    value: appPalette.accountAsset,
    purpose: "資産カテゴリ専用。Action とは独立した青。",
    examples: ["普通預金", "売掛金", "現金"],
    preview: "message",
    fg: appPalette.accountAsset,
    border: appPalette.accountAssetBorder,
  },
  {
    group: "Account Visual",
    name: "Account Liability",
    value: appPalette.accountLiability,
    purpose: "負債カテゴリ専用。Danger とは独立した赤。",
    examples: ["借入金", "未払金", "買掛金"],
    preview: "message",
    fg: appPalette.accountLiability,
    border: appPalette.accountLiabilityBorder,
  },
  {
    group: "Account Visual",
    name: "Account Equity",
    value: appPalette.accountEquity,
    purpose: "純資産カテゴリ専用。落ち着いた緑。",
    examples: ["元入金", "事業主借", "事業主貸"],
    preview: "message",
    fg: appPalette.accountEquity,
    border: appPalette.accountEquityBorder,
  },
  {
    group: "Account Visual",
    name: "Account Revenue",
    value: appPalette.accountRevenue,
    purpose: "収益カテゴリ専用。純資産/利益と同じ緑。",
    examples: ["売上高", "雑収入", "受取利息"],
    preview: "message",
    fg: appPalette.accountRevenue,
    border: appPalette.accountRevenueBorder,
  },
  {
    group: "Account Visual",
    name: "Account Expense",
    value: appPalette.accountExpense,
    purpose: "費用カテゴリ専用。資産と同じ青。",
    examples: ["通信費", "消耗品費", "旅費交通費"],
    preview: "message",
    fg: appPalette.accountExpense,
    border: appPalette.accountExpenseBorder,
  },
  {
    group: "Account Visual",
    name: "Account Profit",
    value: appPalette.accountProfit,
    purpose: "利益カテゴリ専用。純資産/収益と同じ緑。",
    examples: ["利益", "当期利益", "黒字"],
    preview: "message",
    fg: appPalette.accountProfit,
    border: appPalette.accountProfitBorder,
  },
  {
    group: "Account Visual",
    name: "Account Loss",
    value: appPalette.accountLoss,
    purpose: "損失カテゴリ専用。負債と同じ赤。",
    examples: ["損失", "当期損失", "赤字"],
    preview: "message",
    fg: appPalette.accountLoss,
    border: appPalette.accountLossBorder,
  },
];

export function ColorThemePage() {
  if (false) {
    return (
      <section style={{ padding: 24 }}>
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            color: appPalette.textSecondary,
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
        background: appPalette.page,
        padding: "34px 22px 72px",
        color: appPalette.textPrimary,
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <BackLink />
        <div style={{ marginTop: 22, display: "grid", gap: 18 }}>
          <ColorPalettes />
          <ApplicationSample />
        </div>
      </div>
    </main>
  );
}

function ColorPalettes() {
  const groups = Array.from(new Set(paletteTokens.map((token) => token.group)));
  return (
    <section style={{ padding: "6px 0 0" }}>
      <h2
        style={{
          margin: 0,
          fontSize: typography.pageTitle.fontSize,
          lineHeight: 1.25,
          color: appPalette.textPrimary,
        }}
      >
        COLOR PALETTES
      </h2>
      {groups.map((group) => (
        <section key={group} style={{ marginTop: 24 }}>
          <h3
            style={{
              margin: 0,
              fontSize: fontSize.xl,
              lineHeight: 1.35,
              color: appPalette.textPrimary,
            }}
          >
            {group}
          </h3>
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
              gap: 10,
            }}
          >
            {paletteTokens
              .filter((token) => token.group === group)
              .map((token) => (
                <PaletteTokenCard
                  key={`${token.group}-${token.name}`}
                  token={token}
                />
              ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function PaletteTokenCard({ token }: { token: PaletteToken }) {
  const cardStyle = tokenCardStyle(token);
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "baseline",
        }}
      >
        <div
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.bold,
            color: cardTextColor(token),
          }}
        >
          {token.name}
        </div>
        <code style={{ fontSize: fontSize.xs, color: cardCodeColor(token) }}>
          {token.value}
        </code>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: fontSize.sm,
          color: cardDescriptionColor(token),
          lineHeight: 1.55,
        }}
      >
        {token.purpose}
      </div>
      <TokenPreview token={token} />
    </div>
  );
}

function TokenPreview({ token }: { token: PaletteToken }) {
  if (token.group === "Account Visual") {
    const kind = accountKindForToken(token);
    const label = token.examples[0] ?? token.name;
    if (kind) {
      return (
        <div style={{ marginTop: 10 }}>
          <AccountPill label={label} kind={kind} />
        </div>
      );
    }
  }
  if (token.preview === "button") {
    return (
      <div style={{ marginTop: 8 }}>
        <button
          style={buttonStyle(
            token.value,
            token.fg ?? appPalette.brandPaper,
            token.border ?? token.value,
          )}
        >
          操作ボタン
        </button>
      </div>
    );
  }
  if (token.preview === "message") {
    return (
      <div
        style={{
          marginTop: 10,
          background: token.value,
          border: `1px solid ${token.border ?? appPalette.borderSubtle}`,
          borderRadius: 10,
          padding: "8px 10px",
        }}
      >
        <div
          style={{
            color: token.fg ?? appPalette.textPrimary,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.bold,
          }}
        >
          メッセージ背景
        </div>
        <div
          style={{
            marginTop: 2,
            color: appPalette.textSecondary,
            fontSize: fontSize.xs,
          }}
        >
          透過ではなく固定色として参照する。
        </div>
      </div>
    );
  }
  if (token.preview === "border") {
    return null;
  }
  if (token.preview === "text") {
    return (
      <div
        style={{
          marginTop: 8,
          background: appPalette.surface,
          border: `1px solid ${appPalette.borderSubtle}`,
          borderRadius: 10,
          padding: "8px 10px",
          color: token.fg ?? token.value,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
        }}
      >
        この文字色で表示される UI テキスト
      </div>
    );
  }
  return null;
}

function tokenCardStyle(token: PaletteToken): React.CSSProperties {
  if (token.group === "Account Visual") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: accountBackgroundForToken(token),
      border: `1px solid ${token.border ?? appPalette.borderSubtle}`,
    };
  }
  if (token.group === "Canvas / Surface") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: token.value,
      border: `1px solid ${token.border ?? appPalette.borderSubtle}`,
    };
  }
  if (token.group === "Border") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: token.bg ?? appPalette.surface,
      border: `2px solid ${token.value}`,
    };
  }
  if (token.group === "Text") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: appPalette.surface,
      border: `1px solid ${appPalette.borderSubtle}`,
    };
  }
  if (token.preview === "message") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: token.value,
      border: `1px solid ${token.border ?? appPalette.borderSubtle}`,
    };
  }
  return {
    minHeight: 144,
    padding: 14,
    borderRadius: 14,
    background: appPalette.surface,
    border: `1px solid ${appPalette.borderSubtle}`,
  };
}

function cardTextColor(token: PaletteToken): string {
  if (token.group === "Account Visual") return token.value;
  if (token.name === "Brand Ink") return appPalette.brandPaper;
  if (token.preview === "button") return token.value;
  if (token.preview === "message") return token.fg ?? appPalette.textPrimary;
  if (token.preview === "text") return token.fg ?? token.value;
  return appPalette.textPrimary;
}

function cardDescriptionColor(token: PaletteToken): string {
  if (token.group === "Account Visual") return appPalette.textSecondary;
  if (token.name === "Brand Ink") return appPalette.brandPaper;
  if (token.preview === "message") return appPalette.textSecondary;
  if (token.preview === "text") return token.fg ?? appPalette.textSecondary;
  return appPalette.textSecondary;
}

function cardCodeColor(token: PaletteToken): string {
  if (token.group === "Account Visual") return token.value;
  if (token.name === "Brand Ink") return appPalette.brandPaper;
  if (token.preview === "message") return token.fg ?? appPalette.textLabel;
  return appPalette.textLabel;
}

function accountBackgroundForToken(token: PaletteToken): string {
  switch (token.name) {
    case "Account Asset":
      return appPalette.accountAssetBackground;
    case "Account Liability":
      return appPalette.accountLiabilityBackground;
    case "Account Equity":
      return appPalette.accountEquityBackground;
    case "Account Revenue":
      return appPalette.accountRevenueBackground;
    case "Account Expense":
      return appPalette.accountExpenseBackground;
    case "Account Profit":
      return appPalette.accountProfitBackground;
    case "Account Loss":
      return appPalette.accountLossBackground;
    default:
      return appPalette.surface;
  }
}

function ApplicationSample() {
  return (
    <section
      style={{
        background: appPalette.surface,
        border: `1px solid ${appPalette.borderStrong}`,
        borderRadius: 18,
        padding: 18,
        boxShadow: shadows.card,
      }}
    >
      <Kicker>APPLICATION SAMPLE</Kicker>
      <div
        style={{
          marginTop: 14,
          border: `1px solid ${appPalette.borderStrong}`,
          borderRadius: 18,
          overflow: "hidden",
          background: appPalette.page,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(150px, 188px) minmax(520px, 1fr)",
            minHeight: 620,
            overflowX: "auto",
          }}
        >
          <aside
            style={{
              borderRight: `1px solid ${appPalette.borderStrong}`,
              background: appPalette.surface,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: appPalette.brandInk,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.bold,
                    color: appPalette.brandInk,
                  }}
                >
                  オープン会計
                </div>
                <div
                  style={{
                    fontSize: fontSize.micro,
                    fontWeight: fontWeight.bold,
                    color: appPalette.textLabel,
                  }}
                >
                  Dev環境
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 4 }}>
              {["手順", "仕訳", "補助"].map((item, index) => (
                <div
                  key={item}
                  style={{
                    padding: "9px 10px",
                    borderRadius: 9,
                    background:
                      index === 1 ? appPalette.surfaceTint : "transparent",
                    color:
                      index === 1
                        ? appPalette.textPrimary
                        : appPalette.textSecondary,
                    fontSize: fontSize.sm,
                    fontWeight:
                      index === 1 ? fontWeight.bold : fontWeight.semibold,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
            <button
              style={{
                ...buttonStyle(
                  appPalette.brandInk,
                  appPalette.brandPaper,
                  appPalette.brandInk,
                ),
                width: "100%",
                marginTop: 290,
              }}
            >
              公式サイト
            </button>
          </aside>
          <main style={{ background: appPalette.page, padding: 18 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: typography.dialogTitle.fontSize,
                    fontWeight: fontWeight.bold,
                    color: appPalette.textPrimary,
                  }}
                >
                  仕訳
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: fontSize.sm,
                    color: appPalette.textSecondary,
                  }}
                >
                  2026年分の取引を確認・入力します。
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={outlineButtonStyle(appPalette.action)}>
                  ファイル
                </button>
                <button style={primaryButtonStyle(appPalette.action)}>
                  仕訳を追加
                </button>
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr",
                gap: 14,
              }}
            >
              <div
                style={{
                  border: `1px solid ${appPalette.borderStrong}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  background: appPalette.surface,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 96px 96px",
                    background: appPalette.surfaceHeader,
                    borderBottom: `1px solid ${appPalette.borderControl}`,
                    color: appPalette.textLabel,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  <div style={{ padding: "10px 12px" }}>摘要</div>
                  <div style={{ padding: "10px 12px", textAlign: "right" }}>
                    借方
                  </div>
                  <div style={{ padding: "10px 12px", textAlign: "right" }}>
                    貸方
                  </div>
                </div>
                {["売上入金", "通信費", "減価償却"].map((row, index) => (
                  <div
                    key={row}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 96px 96px",
                      background:
                        index === 1
                          ? appPalette.surfaceTint
                          : appPalette.surface,
                      borderTop:
                        index > 0
                          ? `1px solid ${appPalette.borderSubtle}`
                          : "none",
                      fontSize: fontSize.sm,
                    }}
                  >
                    <div
                      style={{
                        padding: "11px 12px",
                        color: appPalette.textPrimary,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      {row}
                    </div>
                    <div
                      style={{
                        padding: "11px 12px",
                        textAlign: "right",
                        color: appPalette.textSecondary,
                      }}
                    >
                      {index === 0 ? "120,000" : "18,400"}
                    </div>
                    <div
                      style={{
                        padding: "11px 12px",
                        textAlign: "right",
                        color: appPalette.textSecondary,
                      }}
                    >
                      {index === 0 ? "" : "18,400"}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <Message
                  title="コメント"
                  text="証憑の確認が必要です。"
                  bg={appPalette.actionBackground}
                  border={appPalette.actionBorder}
                  fg={appPalette.action}
                />
                <Message
                  title="警告"
                  text="未分類の仕訳が 2 件あります。"
                  bg={appPalette.warningBackground}
                  border={appPalette.warningBorder}
                  fg={appPalette.warning}
                />
                <Message
                  title="成功"
                  text="CSV を取り込みました。"
                  bg={appPalette.successBackground}
                  border={appPalette.successBorder}
                  fg={appPalette.success}
                />
                <div
                  style={{
                    background: appPalette.surfaceTint,
                    border: `1px solid ${appPalette.borderSubtle}`,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.bold,
                      color: appPalette.textLabel,
                    }}
                  >
                    フォーム領域
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      background: appPalette.surface,
                      border: `1px solid ${appPalette.borderControl}`,
                      borderRadius: 9,
                      padding: "9px 10px",
                      color: appPalette.textPrimary,
                      fontSize: fontSize.sm,
                    }}
                  >
                    普通預金
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      background: appPalette.surface,
                      border: `1px solid ${appPalette.borderControl}`,
                      borderRadius: 9,
                      padding: "9px 10px",
                      color: appPalette.textMuted,
                      fontSize: fontSize.sm,
                    }}
                  >
                    摘要を入力
                  </div>
                </div>
                <ButtonMatrix />
              </div>
            </div>
            <AccountContainerSample />
          </main>
        </div>
      </div>
    </section>
  );
}

function ButtonMatrix() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          color: appPalette.textLabel,
        }}
      >
        ボタン用途
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={primaryButtonStyle(appPalette.action)}>追加</button>
        <button style={outlineButtonStyle(appPalette.action)}>
          キャンセル
        </button>
        <button style={primaryButtonStyle(appPalette.decision)}>確定</button>
        <button style={primaryButtonStyle(appPalette.danger)}>削除</button>
        <button style={neutralButtonStyle()}>詳細</button>
      </div>
    </div>
  );
}

function AccountContainerSample() {
  const accounts = [
    { label: "普通預金", kind: "asset" },
    { label: "借入金", kind: "liability" },
    { label: "元入金", kind: "equity" },
    { label: "売上高", kind: "revenue" },
    { label: "通信費", kind: "expense" },
    { label: "利益", kind: "profit" },
    { label: "損失", kind: "loss" },
  ] as const;
  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: fontSize.base,
          fontWeight: fontWeight.bold,
          color: appPalette.textPrimary,
        }}
      >
        勘定科目コンテナ
      </div>
      <div style={accountContainerGroupStyle()}>
        {accounts.map((account) => (
          <AccountPill
            key={account.label}
            label={account.label}
            kind={account.kind}
          />
        ))}
      </div>
    </section>
  );
}

function AccountPill({ label, kind }: { label: string; kind: AccountKind }) {
  const visual = accountVisuals[kind];
  return (
    <div
      style={{
        width: 136,
        minHeight: 36,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "0 11px",
        borderRadius: 10,
        background: visual.bg,
        border: `1px solid ${visual.color}`,
        color: visual.color,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
      }}
    >
      <AccountIcon kind={kind} color={visual.color} size={16} />
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

type AccountKind =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "profit"
  | "loss";

const accountVisuals: Record<
  AccountKind,
  { color: string; bg: string; border: string; icon: string }
> = {
  asset: {
    color: appPalette.accountAsset,
    bg: appPalette.accountAssetBackground,
    border: appPalette.accountAssetBorder,
    icon: "/icons/assets.svg",
  },
  liability: {
    color: appPalette.accountLiability,
    bg: appPalette.accountLiabilityBackground,
    border: appPalette.accountLiabilityBorder,
    icon: "/icons/liabilities.svg",
  },
  equity: {
    color: appPalette.accountEquity,
    bg: appPalette.accountEquityBackground,
    border: appPalette.accountEquityBorder,
    icon: "/icons/net-assets.svg",
  },
  revenue: {
    color: appPalette.accountRevenue,
    bg: appPalette.accountRevenueBackground,
    border: appPalette.accountRevenueBorder,
    icon: "/icons/revenue.svg",
  },
  expense: {
    color: appPalette.accountExpense,
    bg: appPalette.accountExpenseBackground,
    border: appPalette.accountExpenseBorder,
    icon: "/icons/expense.svg",
  },
  profit: {
    color: appPalette.accountProfit,
    bg: appPalette.accountProfitBackground,
    border: appPalette.accountProfitBorder,
    icon: "/icons/profit.svg",
  },
  loss: {
    color: appPalette.accountLoss,
    bg: appPalette.accountLossBackground,
    border: appPalette.accountLossBorder,
    icon: "/icons/loss.svg",
  },
};

function accountKindForToken(token: PaletteToken): AccountKind | null {
  switch (token.name) {
    case "Account Asset":
      return "asset";
    case "Account Liability":
      return "liability";
    case "Account Equity":
      return "equity";
    case "Account Revenue":
      return "revenue";
    case "Account Expense":
      return "expense";
    case "Account Profit":
      return "profit";
    case "Account Loss":
      return "loss";
    default:
      return null;
  }
}

function AccountIcon({
  kind,
  color,
  size,
}: {
  kind: AccountKind;
  color: string;
  size: number;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "block",
        flexShrink: 0,
        backgroundColor: color,
        maskImage: `url('${accountVisuals[kind].icon}')`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url('${accountVisuals[kind].icon}')`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function CurrentAudit() {
  return null;
}

function BackLink() {
  return (
    <Link
      href="/debug"
      style={{
        color: appPalette.textSecondary,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        textDecoration: "none",
      }}
    >
      ← debug
    </Link>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        letterSpacing: "0.08em",
        color: appPalette.textLabel,
      }}
    >
      {children}
    </div>
  );
}

function buttonStyle(
  bg: string,
  fg: string,
  border: string,
): React.CSSProperties {
  return {
    height: 36,
    padding: "0 14px",
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: bg,
    color: fg,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
  };
}

function primaryButtonStyle(color: string): React.CSSProperties {
  return {
    ...buttonStyle(color, appPalette.brandPaper, color),
    boxShadow:
      color === appPalette.action
        ? "0 1px 2px rgba(37, 99, 235, 0.22)"
        : "none",
  };
}

function outlineButtonStyle(color: string): React.CSSProperties {
  return buttonStyle(appPalette.surface, color, color);
}

function neutralButtonStyle(): React.CSSProperties {
  return buttonStyle(
    appPalette.surface,
    appPalette.textSecondary,
    appPalette.borderControl,
  );
}

function accountContainerGroupStyle(): React.CSSProperties {
  return {
    marginTop: 8,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: 10,
    borderRadius: 14,
    border: `1px solid ${appPalette.borderSubtle}`,
    background: appPalette.surfaceTint,
  };
}

function Chip({
  label,
  bg,
  fg,
  border,
}: {
  label: string;
  bg: string;
  fg: string;
  border: string;
}) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontSize: fontSize.sm,
        fontWeight: fontWeight.bold,
      }}
    >
      {label}
    </span>
  );
}

function Message({
  title,
  text,
  bg,
  border,
  fg,
}: {
  title: string;
  text: string;
  bg: string;
  border: string;
  fg: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 13,
        padding: 10,
      }}
    >
      <div
        style={{
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          color: fg,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: fontSize.sm,
          lineHeight: 1.55,
          color: appPalette.textPrimary,
        }}
      >
        {text}
      </div>
    </div>
  );
}
