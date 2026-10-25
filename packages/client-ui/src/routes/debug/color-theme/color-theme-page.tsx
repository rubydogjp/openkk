import Link from "next/link.js";
import type { CSSProperties, ReactNode } from "react";

import {
  fontSize,
  fontWeight,
  shadows,
  tokenDefaults,
  typography,
} from "../../../shared/design-tokens.js";
import { MaskIcon } from "../../../shared/icons.js";

type PaletteToken = {
  group: string;
  name: string;
  value: string;
  purpose: string;
  examples: string[];
  preview: "surface" | "border" | "button" | "message" | "text";
  fg: string | null;
  bg: string | null;
  border: string | null;
};

const paletteValues = tokenDefaults.palette;

const paletteTokens: PaletteToken[] = [
  {
    group: "Canvas / Surface",
    name: "Page Bg",
    value: paletteValues.pageBg,
    purpose: "画面全体の基本背景。",
    examples: ["/entries の作業面", "詳細 drawer 背景", "一覧ページの余白"],
    preview: "surface",
    border: paletteValues.borderSubtle,
    fg: null,
    bg: null,
  },
  {
    group: "Canvas / Surface",
    name: "Surface",
    value: paletteValues.surface,
    purpose: "カード、入力欄、ポップアップなど最上層の面。",
    examples: ["テーブル行", "入力フィールド", "dropdown menu"],
    preview: "surface",
    border: paletteValues.borderSubtle,
    fg: null,
    bg: null,
  },
  {
    group: "Canvas / Surface",
    name: "Surface Tint",
    value: paletteValues.surfaceTint,
    purpose: "フォームグループ、hover、弱いカードをまとめて受ける薄い塗り。",
    examples: ["フォームグループ", "hover row", "readonly 周辺"],
    preview: "surface",
    border: paletteValues.borderSubtle,
    fg: null,
    bg: null,
  },
  {
    group: "Canvas / Surface",
    name: "Header Surface",
    value: paletteValues.headerSurface,
    purpose: "テーブルヘッダー、非データ面、強めのラベル帯。",
    examples: ["仕訳一覧ヘッダー", "空テーブル面", "セクション見出し帯"],
    preview: "surface",
    border: paletteValues.borderStrong,
    fg: null,
    bg: null,
  },
  {
    group: "Border",
    name: "Border Subtle",
    value: paletteValues.borderSubtle,
    purpose: "弱い枠と内部 divider。最も使用頻度が高い境界。",
    examples: ["dropdown", "readonly field", "行間 divider"],
    preview: "border",
    bg: paletteValues.surface,
    border: paletteValues.borderSubtle,
    fg: null,
  },
  {
    group: "Border",
    name: "Border Strong",
    value: paletteValues.borderStrong,
    purpose: "操作可能な入力欄の標準枠。",
    examples: ["text input", "select", "date picker button"],
    preview: "border",
    bg: paletteValues.surfaceTint,
    border: paletteValues.borderStrong,
    fg: null,
  },
  {
    group: "Border",
    name: "Border Emphasis",
    value: paletteValues.borderEmphasis,
    purpose: "大領域の分離と強い外枠。常時見える境界。",
    examples: ["sidebar 境界", "table outer border", "main card"],
    preview: "border",
    bg: paletteValues.pageBg,
    border: paletteValues.borderEmphasis,
    fg: null,
  },
  {
    group: "Text",
    name: "Text",
    value: paletteValues.text,
    purpose: "主要テキスト。見出し、金額、入力値。",
    examples: ["ページ見出し", "金額", "仕訳行の主情報"],
    preview: "text",
    fg: paletteValues.text,
    bg: null,
    border: null,
  },
  {
    group: "Text",
    name: "Text Soft",
    value: paletteValues.textSoft,
    purpose: "本文説明や二次情報。",
    examples: ["カード説明", "補足テキスト", "サブタイトル"],
    preview: "text",
    fg: paletteValues.textSoft,
    bg: null,
    border: null,
  },
  {
    group: "Text",
    name: "Text Label",
    value: paletteValues.textLabel,
    purpose: "ラベル、メタ情報、caption。",
    examples: ["フィールドラベル", "テーブルヘッダー文字", "日付 meta"],
    preview: "text",
    fg: paletteValues.textLabel,
    bg: null,
    border: null,
  },
  {
    group: "Text",
    name: "Text Muted",
    value: paletteValues.textMuted,
    purpose: "disabled、placeholder、弱い補助。",
    examples: ["placeholder", "無効メニュー", "未選択表示"],
    preview: "text",
    fg: paletteValues.textMuted,
    bg: null,
    border: null,
  },
  {
    group: "Action",
    name: "Action",
    value: paletteValues.action,
    purpose: "通常の主操作。保存、次へ、開く。",
    examples: ["保存する", "仕訳を追加", "リストを開く"],
    preview: "button",
    fg: paletteValues.surface,
    border: paletteValues.action,
    bg: null,
  },
  {
    group: "Action",
    name: "Action Bg",
    value: paletteValues.actionBg,
    purpose: "コメント、情報、選択中の薄い背景。",
    examples: ["コメントフィールド背景", "active row", "情報 chip 背景"],
    preview: "message",
    fg: paletteValues.action,
    border: paletteValues.actionBorder,
    bg: null,
  },
  {
    group: "Action",
    name: "Action Border",
    value: paletteValues.actionBorder,
    purpose: "Action Background と組み合わせる固定境界色。",
    examples: ["情報メッセージ枠", "青 outline chip", "選択カード枠"],
    preview: "border",
    bg: paletteValues.actionBg,
    border: paletteValues.actionBorder,
    fg: null,
  },
  {
    group: "Success",
    name: "Success",
    value: paletteValues.success,
    purpose: "成功状態、完了表示、開始・確定などの前進操作。",
    examples: ["完了 chip", "開始する", "本締めを実行"],
    preview: "button",
    fg: paletteValues.surface,
    border: paletteValues.success,
    bg: null,
  },
  {
    group: "Success",
    name: "Success Bg",
    value: paletteValues.successBg,
    purpose: "成功メッセージや完了 chip の背景。",
    examples: ["インポート完了 banner", "完了 status", "成功 notice"],
    preview: "message",
    fg: paletteValues.success,
    border: paletteValues.successBorder,
    bg: null,
  },
  {
    group: "Warning",
    name: "Warning",
    value: paletteValues.warning,
    purpose: "注意・確認待ち。破壊的ではない警告。",
    examples: ["未分類があります", "仮締め前の注意", "要確認 chip"],
    preview: "button",
    fg: paletteValues.surface,
    border: paletteValues.warning,
    bg: null,
  },
  {
    group: "Warning",
    name: "Warning Bg",
    value: paletteValues.warningBg,
    purpose: "警告 message / demo data banner の背景。",
    examples: ["注意 banner", "デモデータ notice", "確認待ち row"],
    preview: "message",
    fg: paletteValues.warning,
    border: paletteValues.warningBorder,
    bg: null,
  },
  {
    group: "Danger",
    name: "Danger",
    value: paletteValues.danger,
    purpose: "危険・削除・エラー。",
    examples: ["削除する", "エラー icon", "破棄 action"],
    preview: "button",
    fg: paletteValues.surface,
    border: paletteValues.danger,
    bg: null,
  },
  {
    group: "Danger",
    name: "Danger Bg",
    value: paletteValues.dangerBg,
    purpose: "エラーメッセージや削除確認の背景。",
    examples: ["エラー banner", "危険 notice", "削除確認 card"],
    preview: "message",
    fg: paletteValues.danger,
    border: paletteValues.dangerBorder,
    bg: null,
  },
  {
    group: "Account Visual",
    name: "Account Asset",
    value: paletteValues.accountAsset,
    purpose: "資産カテゴリ専用。Action とは独立した青。",
    examples: ["普通預金", "売掛金", "現金"],
    preview: "message",
    fg: paletteValues.accountAsset,
    border: paletteValues.accountAsset,
    bg: null,
  },
  {
    group: "Account Visual",
    name: "Account Liability",
    value: paletteValues.accountLiability,
    purpose: "負債カテゴリ専用。Danger とは独立した赤。",
    examples: ["借入金", "未払金", "買掛金"],
    preview: "message",
    fg: paletteValues.accountLiability,
    border: paletteValues.accountLiability,
    bg: null,
  },
  {
    group: "Account Visual",
    name: "Account Equity",
    value: paletteValues.accountEquity,
    purpose: "純資産カテゴリ専用。落ち着いた緑。",
    examples: ["元入金", "事業主借", "事業主貸"],
    preview: "message",
    fg: paletteValues.accountEquity,
    border: paletteValues.accountEquity,
    bg: null,
  },
  {
    group: "Account Visual",
    name: "Account Revenue",
    value: paletteValues.accountRevenue,
    purpose: "収益カテゴリ専用。純資産/利益と同じ緑。",
    examples: ["売上高", "雑収入", "受取利息"],
    preview: "message",
    fg: paletteValues.accountRevenue,
    border: paletteValues.accountRevenue,
    bg: null,
  },
  {
    group: "Account Visual",
    name: "Account Expense",
    value: paletteValues.accountExpense,
    purpose: "費用カテゴリ専用。資産と同じ青。",
    examples: ["通信費", "消耗品費", "旅費交通費"],
    preview: "message",
    fg: paletteValues.accountExpense,
    border: paletteValues.accountExpense,
    bg: null,
  },
  {
    group: "Account Visual",
    name: "Account Profit",
    value: paletteValues.accountProfit,
    purpose: "利益カテゴリ専用。資産/費用と同じ青。",
    examples: ["利益", "当期利益", "黒字"],
    preview: "message",
    fg: paletteValues.accountProfit,
    border: paletteValues.accountProfit,
    bg: null,
  },
];

export function ColorThemePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: paletteValues.pageBg,
        padding: "34px 22px 72px",
        color: paletteValues.text,
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
          color: paletteValues.text,
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
              color: paletteValues.text,
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
            token.fg ?? paletteValues.surface,
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
          border: `1px solid ${token.border ?? paletteValues.borderSubtle}`,
          borderRadius: 10,
          padding: "8px 10px",
        }}
      >
        <div
          style={{
            color: token.fg ?? paletteValues.text,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.bold,
          }}
        >
          メッセージ背景
        </div>
        <div
          style={{
            marginTop: 2,
            color: paletteValues.textSoft,
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
          background: paletteValues.surface,
          border: `1px solid ${paletteValues.borderSubtle}`,
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

function tokenCardStyle(token: PaletteToken): CSSProperties {
  if (token.group === "Account Visual") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: accountBackgroundForToken(token),
      border: `1px solid ${token.border ?? paletteValues.borderSubtle}`,
    };
  }
  if (token.group === "Canvas / Surface") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: token.value,
      border: `1px solid ${token.border ?? paletteValues.borderSubtle}`,
    };
  }
  if (token.group === "Border") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: token.bg ?? paletteValues.surface,
      border: `2px solid ${token.value}`,
    };
  }
  if (token.group === "Text") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: paletteValues.surface,
      border: `1px solid ${paletteValues.borderSubtle}`,
    };
  }
  if (token.preview === "message") {
    return {
      minHeight: 144,
      padding: 14,
      borderRadius: 14,
      background: token.value,
      border: `1px solid ${token.border ?? paletteValues.borderSubtle}`,
    };
  }
  return {
    minHeight: 144,
    padding: 14,
    borderRadius: 14,
    background: paletteValues.surface,
    border: `1px solid ${paletteValues.borderSubtle}`,
  };
}

function cardTextColor(token: PaletteToken): string {
  if (token.group === "Account Visual") return token.value;
  if (token.preview === "button") return token.value;
  if (token.preview === "message") return token.fg ?? paletteValues.text;
  if (token.preview === "text") return token.fg ?? token.value;
  return paletteValues.text;
}

function cardDescriptionColor(token: PaletteToken): string {
  if (token.group === "Account Visual") return paletteValues.textSoft;
  if (token.preview === "message") return paletteValues.textSoft;
  if (token.preview === "text") return token.fg ?? paletteValues.textSoft;
  return paletteValues.textSoft;
}

function cardCodeColor(token: PaletteToken): string {
  if (token.group === "Account Visual") return token.value;
  if (token.preview === "message") return token.fg ?? paletteValues.textLabel;
  return paletteValues.textLabel;
}

function accountBackgroundForToken(token: PaletteToken): string {
  switch (token.name) {
    case "Account Asset":
      return paletteValues.accountAssetBg;
    case "Account Liability":
      return paletteValues.accountLiabilityBg;
    case "Account Equity":
      return paletteValues.accountEquityBg;
    case "Account Revenue":
      return paletteValues.accountRevenueBg;
    case "Account Expense":
      return paletteValues.accountExpenseBg;
    case "Account Profit":
      return paletteValues.accountProfitBg;
    default:
      return paletteValues.surface;
  }
}

function ApplicationSample() {
  return (
    <section
      style={{
        background: paletteValues.surface,
        border: `1px solid ${paletteValues.borderEmphasis}`,
        borderRadius: 18,
        padding: 18,
        boxShadow: shadows.card,
      }}
    >
      <Kicker>APPLICATION SAMPLE</Kicker>
      <div
        style={{
          marginTop: 14,
          border: `1px solid ${paletteValues.borderEmphasis}`,
          borderRadius: 18,
          overflow: "hidden",
          background: paletteValues.pageBg,
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
              borderRight: `1px solid ${paletteValues.borderEmphasis}`,
              background: paletteValues.surface,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: paletteValues.text,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.bold,
                    color: paletteValues.text,
                  }}
                >
                  オープン会計
                </div>
                <div
                  style={{
                    fontSize: fontSize.micro,
                    fontWeight: fontWeight.bold,
                    color: paletteValues.textLabel,
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
                      index === 1 ? paletteValues.surfaceTint : "transparent",
                    color:
                      index === 1
                        ? paletteValues.text
                        : paletteValues.textSoft,
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
                  paletteValues.text,
                  paletteValues.surface,
                  paletteValues.text,
                ),
                width: "100%",
                marginTop: 290,
              }}
            >
              公式サイト
            </button>
          </aside>
          <main style={{ background: paletteValues.pageBg, padding: 18 }}>
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
                    color: paletteValues.text,
                  }}
                >
                  仕訳
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: fontSize.sm,
                    color: paletteValues.textSoft,
                  }}
                >
                  2026年分の取引を確認・入力します。
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={outlineButtonStyle(paletteValues.action)}>
                  ファイル
                </button>
                <button style={primaryButtonStyle(paletteValues.action)}>
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
                  border: `1px solid ${paletteValues.borderEmphasis}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  background: paletteValues.surface,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 96px 96px",
                    background: paletteValues.headerSurface,
                    borderBottom: `1px solid ${paletteValues.borderStrong}`,
                    color: paletteValues.textLabel,
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
                          ? paletteValues.surfaceTint
                          : paletteValues.surface,
                      borderTop:
                        index > 0
                          ? `1px solid ${paletteValues.borderSubtle}`
                          : "none",
                      fontSize: fontSize.sm,
                    }}
                  >
                    <div
                      style={{
                        padding: "11px 12px",
                        color: paletteValues.text,
                        fontWeight: fontWeight.bold,
                      }}
                    >
                      {row}
                    </div>
                    <div
                      style={{
                        padding: "11px 12px",
                        textAlign: "right",
                        color: paletteValues.textSoft,
                      }}
                    >
                      {index === 0 ? "120,000" : "18,400"}
                    </div>
                    <div
                      style={{
                        padding: "11px 12px",
                        textAlign: "right",
                        color: paletteValues.textSoft,
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
                  bg={paletteValues.actionBg}
                  border={paletteValues.actionBorder}
                  fg={paletteValues.action}
                />
                <Message
                  title="警告"
                  text="未分類の仕訳が 2 件あります。"
                  bg={paletteValues.warningBg}
                  border={paletteValues.warningBorder}
                  fg={paletteValues.warning}
                />
                <Message
                  title="成功"
                  text="CSV を取り込みました。"
                  bg={paletteValues.successBg}
                  border={paletteValues.successBorder}
                  fg={paletteValues.success}
                />
                <div
                  style={{
                    background: paletteValues.surfaceTint,
                    border: `1px solid ${paletteValues.borderSubtle}`,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.bold,
                      color: paletteValues.textLabel,
                    }}
                  >
                    フォーム領域
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      background: paletteValues.surface,
                      border: `1px solid ${paletteValues.borderStrong}`,
                      borderRadius: 9,
                      padding: "9px 10px",
                      color: paletteValues.text,
                      fontSize: fontSize.sm,
                    }}
                  >
                    普通預金
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      background: paletteValues.surface,
                      border: `1px solid ${paletteValues.borderStrong}`,
                      borderRadius: 9,
                      padding: "9px 10px",
                      color: paletteValues.textMuted,
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
          color: paletteValues.textLabel,
        }}
      >
        ボタン用途
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={primaryButtonStyle(paletteValues.action)}>追加</button>
        <button style={outlineButtonStyle(paletteValues.action)}>
          キャンセル
        </button>
        <button style={primaryButtonStyle(paletteValues.success)}>確定</button>
        <button style={primaryButtonStyle(paletteValues.danger)}>削除</button>
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
          color: paletteValues.text,
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
      <MaskIcon src={visual.icon} color={visual.color} size={16} />
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
  { color: string; bg: string; icon: string }
> = {
  asset: {
    color: paletteValues.accountAsset,
    bg: paletteValues.accountAssetBg,
    icon: "/icons/assets.svg",
  },
  liability: {
    color: paletteValues.accountLiability,
    bg: paletteValues.accountLiabilityBg,
    icon: "/icons/liabilities.svg",
  },
  equity: {
    color: paletteValues.accountEquity,
    bg: paletteValues.accountEquityBg,
    icon: "/icons/net-assets.svg",
  },
  revenue: {
    color: paletteValues.accountRevenue,
    bg: paletteValues.accountRevenueBg,
    icon: "/icons/revenue.svg",
  },
  expense: {
    color: paletteValues.accountExpense,
    bg: paletteValues.accountExpenseBg,
    icon: "/icons/expense.svg",
  },
  profit: {
    color: paletteValues.accountProfit,
    bg: paletteValues.accountProfitBg,
    icon: "/icons/profit.svg",
  },
  loss: {
    color: paletteValues.danger,
    bg: paletteValues.dangerBg,
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
    default:
      return null;
  }
}

function BackLink() {
  return (
    <Link
      href="/debug"
      style={{
        color: paletteValues.textSoft,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        textDecoration: "none",
      }}
    >
      ← debug
    </Link>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        letterSpacing: "0.08em",
        color: paletteValues.textLabel,
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
): CSSProperties {
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

function primaryButtonStyle(color: string): CSSProperties {
  return {
    ...buttonStyle(color, paletteValues.surface, color),
    boxShadow:
      color === paletteValues.action
        ? "0 1px 2px rgba(37, 99, 235, 0.22)"
        : "none",
  };
}

function outlineButtonStyle(color: string): CSSProperties {
  return buttonStyle(paletteValues.surface, color, color);
}

function neutralButtonStyle(): CSSProperties {
  return buttonStyle(
    paletteValues.surface,
    paletteValues.textSoft,
    paletteValues.borderStrong,
  );
}

function accountContainerGroupStyle(): CSSProperties {
  return {
    marginTop: 8,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: 10,
    borderRadius: 14,
    border: `1px solid ${paletteValues.borderSubtle}`,
    background: paletteValues.surfaceTint,
  };
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
          color: paletteValues.text,
        }}
      >
        {text}
      </div>
    </div>
  );
}
