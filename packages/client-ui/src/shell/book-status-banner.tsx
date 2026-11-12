"use client";

import {
  useOpenkkBookStorage,
  type OpenkkBookFile,
} from "@rubydogjp/openkk-client-usecases";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
} from "../shared/design-tokens.js";

type BannerTone = "danger" | "warning" | "info";

type Banner = {
  tone: BannerTone;
  message: string;
  action: { label: string; run: () => void } | null;
};

const TONES: Record<
  BannerTone,
  { color: string; background: string; border: string }
> = {
  danger: {
    color: palette.danger,
    background: palette.dangerBg,
    border: palette.dangerBorder,
  },
  warning: {
    color: palette.warning,
    background: palette.warningBg,
    border: palette.warningBorder,
  },
  info: {
    color: palette.action,
    background: palette.actionBg,
    border: palette.actionBorder,
  },
};

export function BookStatusBanner(props: {
  bookFile: OpenkkBookFile | null;
  onSave: (() => void) | null;
}) {
  const storage = useOpenkkBookStorage();
  if (storage == null) return null;
  const { bookFile, onSave } = props;
  const banners: Banner[] = [];
  if (storage.status === "failed") {
    banners.push({
      tone: "danger",
      message:
        "このブラウザの中にデータを保存できませんでした。空き容量を確かめてください。左上の「保存」でファイルに保存しておくと安心です。",
      action: {
        label: "もう一度保存",
        run: () => void storage.retry().catch(() => {}),
      },
    });
  }
  if (storage.unreadableBookCount > 0) {
    banners.push({
      tone: "warning",
      message: `読み込めない会計期間のデータが ${storage.unreadableBookCount} 件あります。新しい版のオープン会計で作られた可能性があります。ページを読み込み直して、アプリを最新にしてください。`,
      action: null,
    });
  }
  if (bookFile?.reminderDue === true && onSave != null) {
    banners.push({
      tone: "info",
      message:
        bookFile.lastSavedAt == null
          ? "この会計期間は、まだファイルに保存していません。ブラウザの中のデータは、しばらく開かないと消えることがあります。"
          : "前にファイルへ保存してから 30 日以上たちました。",
      action: { label: "保存", run: onSave },
    });
  }
  return (
    <>
      {banners.map((banner) => {
        const tone = TONES[banner.tone];
        return (
          <div
            key={banner.message}
            role={banner.tone === "info" ? "status" : "alert"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              background: tone.background,
              borderBottom: `1px solid ${tone.border}`,
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: fontSize.sm,
                color: palette.text,
                lineHeight: 1.6,
              }}
            >
              {banner.message}
            </div>
            {banner.action != null ? (
              <button
                type="button"
                onClick={banner.action.run}
                style={{
                  flexShrink: 0,
                  padding: "6px 14px",
                  borderRadius: radii.sm,
                  border: `1px solid ${tone.color}`,
                  background: palette.surface,
                  color: tone.color,
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.bold,
                  cursor: "pointer",
                }}
              >
                {banner.action.label}
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
