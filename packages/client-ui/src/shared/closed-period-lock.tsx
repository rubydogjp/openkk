"use client";

import { useRouter } from "next/navigation";

import { fontSize, fontWeight, palette, radii, sizes, spacing, typography } from "./design-tokens";

export type ClosedPeriodLockProps = {
  title?: string;
  description?: string;
};

export function ClosedPeriodLock({
  title = "ロックされています",
  description = "この期間は仮締め以降のため編集できません。",
}: ClosedPeriodLockProps) {
  const router = useRouter();

  return (
    <section style={{ padding: spacing.s24 }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div
          style={{
            padding: 24,
            borderRadius: 20,
            border: `1px solid ${palette.borderSubtle}`,
            background: palette.surface,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: palette.formGroupBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
              fontSize: typography.pageTitle.fontSize,
            }}
          >
            🔒
          </div>
          <div style={{ marginTop: 16, fontSize: typography.dialogTitle.fontSize, fontWeight: fontWeight.bold }}>
            {title}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: fontSize.md,
              color: palette.textSoft,
              lineHeight: 1.55,
            }}
          >
            {description}
          </div>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => router.push("/steps")}
              style={{
                height: sizes.button.formHeight,
                minWidth: sizes.button.formPrimaryMinWidth,
                padding: "0 16px",
                borderRadius: radii.sm,
                border: "none",
                background: palette.action,
                color: palette.surface,
                ...typography.control,
                fontWeight: fontWeight.bold,
                cursor: "pointer",
              }}
            >
              手順を開く
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
