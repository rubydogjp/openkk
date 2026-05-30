"use client";

import { fontSize, fontWeight, palette } from "../shared/design-tokens";
import {
  guideDescription,
  guideOptions,
  guideTitle,
  type QuickGuideOption,
  type QuickGuidePage,
} from "@rubydogjp/openkk-client-domain";

export function QuickGuidePanel({
  page,
  canGoBack,
  onBack,
  onClose,
  onSelectOption,
}: {
  page: QuickGuidePage;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelectOption: (option: QuickGuideOption) => void;
}) {
  const title = guideTitle(page);
  const description = guideDescription(page);
  const options = guideOptions(page);
  return (

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
      }}
    >

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {canGoBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="戻る"
            style={iconButtonStyle}
          >
            <BackArrowIcon />
          </button>
        ) : (
          <div style={{ width: 28, height: 28 }} />
        )}
        <div
          style={{
            flex: 1,
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            color: palette.text,
            lineHeight: 1.4,
          }}
        >
          {title}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            color: palette.textMuted,
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          閉じる
        </button>
      </div>

      {description != null ? (
        <div
          style={{
            fontSize: fontSize.sm,
            color: palette.textSoft,
            lineHeight: 1.7,
            whiteSpace: "pre-line",
          }}
        >
          {description}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((option, index) => (
          <QuickGuideOptionRow
            key={`${option.title}-${index}`}
            option={option}
            onClick={() => onSelectOption(option)}
          />
        ))}
      </div>
    </div>
  );
}

function QuickGuideOptionRow({
  option,
  onClick,
}: {
  option: QuickGuideOption;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bk-quick-guide-option"
      style={{
        width: "100%",
        textAlign: "left",
        background: palette.surface,
        border: `1px solid ${palette.borderSubtle}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        cursor: "pointer",
      }}
    >
      <style>{`
        .bk-quick-guide-option { transition: background 80ms ease; }
        .bk-quick-guide-option:hover { background: ${palette.hoverSubtle}; }
      `}</style>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            color: palette.text,
            lineHeight: 1.5,
          }}
        >
          {option.title}
        </div>
        {option.subtitle != null && option.subtitle.trim() !== "" ? (
          <div
            style={{
              marginTop: 4,
              fontSize: fontSize.sm,
              color: palette.textSoft,
              lineHeight: 1.5,
            }}
          >
            {option.subtitle}
          </div>
        ) : null}
      </div>
      <ChevronRightIcon />
    </button>
  );
}

const iconButtonStyle = {
  width: 28,
  height: 28,
  border: "none",
  background: "transparent",
  color: palette.textSoft,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  borderRadius: 6,
  padding: 0,
};

function BackArrowIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <polyline
        points="15 6 9 12 15 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0, marginTop: 2 }}
    >
      <polyline
        points="9 6 15 12 9 18"
        stroke={palette.textMuted}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function QuickGuideTriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bk-quick-guide-trigger"
      style={{
        border: "none",
        background: "transparent",
        color: palette.success,
        fontSize: fontSize.base,
        fontWeight: fontWeight.semibold,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 6px",
        borderRadius: 6,
      }}
    >
      <style>{`
        .bk-quick-guide-trigger { transition: background 80ms ease; }
        .bk-quick-guide-trigger:hover { background: rgba(5, 150, 105, 0.08); }
      `}</style>
      <BeginnerIcon color={palette.success} />
      簡単入力ガイド
    </button>
  );
}

function BeginnerIcon({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        display: "block",
        flexShrink: 0,
        backgroundColor: color,
        maskImage: "url('/icons/beginner.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/beginner.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
