"use client";

import { useRouter } from "next/navigation";

import { StepCallout } from "../../steps/step-ui";
import {
  fontSize,
  fontWeight,
  palette,
  sizes,
  typography,
} from "../../shared/design-tokens";

const items = [
  {
    title: "再振替",
    subtitle: "一時的な調整に使う特別な仕訳データ",
    href: "/assist/opening-carryover",
  },
  {
    title: "固定資産",
    subtitle: "数年かけて費用になる資産",
    href: "/assist/fixed-assets",
  },
] as const;

export function AssistPage() {
  const router = useRouter();

  return (

    <section
      style={{
        width: "100%",
        maxWidth: sizes.content.readingMaxWidth,
        margin: "0 auto",
        padding: "24px 24px 96px",
      }}
    >

      <header style={{ marginBottom: 32 }}>
        <h1
          style={{
            margin: 0,
            padding: "0 0 10px",
            borderBottom: `1px solid ${palette.hairline}`,
            fontSize: typography.pageTitle.fontSize,
            fontWeight: fontWeight.bold,
            color: palette.text,
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
          }}
        >
          補助
        </h1>
      </header>

      <StepCallout tone="action">
        仕訳をラクにしよう! ここでは必須ではない補助的な機能を扱います。
      </StepCallout>

      <div style={{ height: 28 }} />

      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${palette.borderHeavy}`,
          background: palette.surface,
          overflow: "hidden",
        }}
      >
        {items.map((item, index) => (
          <div key={item.title}>
            {index > 0 ? (
              <div style={{ height: 1, background: palette.borderHeavy }} />
            ) : null}
            <button
              type="button"
              onClick={() => router.push(item.href)}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <AssistIcon size={22} color={palette.text} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.medium,
                    color: palette.text,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: fontSize.sm,
                    color: palette.textSoft,
                  }}
                >
                  {item.subtitle}
                </div>
              </div>
              <div
                style={{
                  fontSize: typography.dialogTitle.fontSize,
                  color: palette.textSoft,
                  lineHeight: 1,
                }}
              >
                ›
              </div>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AssistIcon({ size, color }: { size: number; color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "block",
        backgroundColor: color,
        maskImage: "url('/icons/assist.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/assist.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
