"use client";

import { fontSize, fontWeight, palette, radii, spacing } from "../shared/design-tokens";

export function MaintenanceScreen(props: { title: string; message: string }) {
  const title = props.title.trim() === "" ? "メンテナンス中" : props.title;
  const message =
    props.message.trim() === ""
      ? "ただいまメンテナンスを実施しています。しばらく経ってから再度お試しください。"
      : props.message;
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: spacing.s24,
        background: palette.surface,
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          textAlign: "center",
          border: `1px solid ${palette.borderSubtle}`,
          borderRadius: radii.lg,
          padding: "40px 28px",
        }}
      >
        <WrenchIcon size={48} color={palette.textLabel} />
        <h1
          style={{
            margin: "20px 0 0",
            fontSize: fontSize.xl,
            fontWeight: fontWeight.bold,
            color: palette.text,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: "14px 0 0",
            fontSize: fontSize.base,
            lineHeight: 1.8,
            color: palette.textSoft,
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </p>
      </div>
    </main>
  );
}

function WrenchIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.3 2.3-2.2-.6-.6-2.2 2.1-2.5z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
