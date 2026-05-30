"use client";

import { useRouter } from "next/navigation";

import {
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import { DemoLockButton } from "../shared/demo-icon";
import { fontSize, fontWeight, palette, radii, shadows, sizes, spacing, typography } from "../shared/design-tokens";

type FiscalPeriod = ReturnType<
  typeof useOpenkkAppState
>["fiscalPeriods"][number];

export function FiscalPeriodsContent() {
  const router = useRouter();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();

  return (
    <section
      style={{
        padding: 24,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: sizes.content.controlBarMaxWidth,
          width: "100%",
          margin: "0 auto",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >

        <header style={{ marginBottom: 14 }}>
          <h1
            style={{
              margin: 0,
              fontSize: typography.dialogTitle.fontSize,
              fontWeight: fontWeight.bold,
              color: palette.text,
              letterSpacing: "-0.01em",
            }}
          >
            期間の選択
          </h1>
        </header>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 14,
          }}
        >
          {openkkConfig.isDemoMode ? (
            <DemoLockButton label="追加" />
          ) : (
            <AddPeriodButton
              onClick={() => router.push("/fiscal-periods/new")}
            />
          )}
        </div>

        <FiscalPeriodsTable
          items={appState.fiscalPeriods}
          onSelect={(periodId) => {
            appState.selectFiscalPeriod(periodId);
            router.push("/steps");
          }}
        />
      </div>
    </section>
  );
}

function FiscalPeriodsTable({
  items,
  onSelect,
}: {
  items: FiscalPeriod[];
  onSelect: (periodId: string) => void;
}) {
  const isEmpty = items.length === 0;
  return (
    <div
      style={{
        background: palette.surface,
        border: `1px solid ${palette.borderEmphasis}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 320,
      }}
    >
      <style>{`
        .bk-fp-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .bk-fp-scroll::-webkit-scrollbar-track { background: transparent; }
        .bk-fp-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-fp-scroll::-webkit-scrollbar-thumb:hover {
          background: #94A3B8;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-fp-row { transition: background 80ms ease; }
        .bk-fp-row.is-clickable { cursor: pointer; }
        .bk-fp-row.is-clickable:hover { background: ${palette.hoverStrong} !important; }
      `}</style>
      {isEmpty ? (
        <FiscalPeriodsEmptyState />
      ) : (
        <div
          className="bk-fp-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
            }}
          >
            {items.map((period, index) => (
              <FiscalPeriodRow
                key={period.id}
                period={period}
                showDivider={index > 0}
                onSelect={() => onSelect(period.id)}
              />
            ))}
            <div
              aria-hidden="true"
              style={{
                flex: "1 1 0",
                minHeight: 0,
                background: palette.formGroupBg,
                borderTop: `1px solid ${palette.borderStrong}`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FiscalPeriodRow({
  period,
  showDivider,
  onSelect,
}: {
  period: FiscalPeriod;
  showDivider: boolean;
  onSelect: () => void;
}) {
  const showOpeningBsChip =
    !period.openingBalancesCompleted && period.settingsCompleted;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="bk-fp-row is-clickable"
      style={{
        border: "none",
        borderTop: showDivider ? `1px solid ${palette.hairline}` : "none",
        background: palette.surface,
        padding: "14px 16px",
        textAlign: "left",
        width: "100%",
        boxSizing: "border-box",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            color: palette.text,
            lineHeight: 1.4,
          }}
        >
          {period.name}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: fontSize.sm,
            color: palette.textLabel,
          }}
        >
          {period.startDate} 〜 {period.endDate}
        </div>
        {showOpeningBsChip ? (
          <div style={{ marginTop: 6 }}>
            <InlineChip
              label="期首BS"
              background={palette.brandTint}
              foreground={palette.brand}
            />
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <InlineChip
          label={stageLabel(period.stage)}
          background={
            period.stage === "journalizing"
              ? "#DCFCE7"
              : palette.formGroupBg
          }
          foreground={
            period.stage === "journalizing"
              ? palette.success
              : palette.textLabel
          }
        />
        <div
          style={{
            fontSize: fontSize.xl,
            color: palette.textLabel,
            lineHeight: 1,
          }}
        >
          ›
        </div>
      </div>
    </button>
  );
}

function FiscalPeriodsEmptyState() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 240,
        display: "grid",
        placeItems: "center",
        padding: 32,
        background: palette.formGroupBg,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto",
            borderRadius: 14,
            background: palette.surface,
            border: `1px solid ${palette.borderStrong}`,
            display: "grid",
            placeItems: "center",
            color: palette.textSoft,
          }}
        >
          <EmptyPeriodsIcon />
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: palette.text,
          }}
        >
          期間がありません
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: fontSize.sm,
            color: palette.textSoft,
            lineHeight: 1.7,
          }}
        >
          上の「追加」ボタンから 1 件目を作成できます。
        </div>
      </div>
    </div>
  );
}

function EmptyPeriodsIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <rect
        x={4}
        y={5}
        width={16}
        height={15}
        rx={2}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1={4}
        y1={10}
        x2={20}
        y2={10}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1={8}
        y1={3}
        x2={8}
        y2={7}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1={16}
        y1={3}
        x2={16}
        y2={7}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AddPeriodButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactIconTextMinWidth,
        padding: "0 14px",
        borderRadius: radii.sm,
        border: "none",
        background: palette.brand,
        color: palette.surface,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
        boxShadow: shadows.primaryButton,
      }}
    >
      <PlusGlyph />
      追加
    </button>
  );
}

function PlusGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InlineChip({
  label,
  background,
  foreground,
}: {
  label: string;
  background: string;
  foreground: string;
}) {
  return (
    <span
      style={{
        height: 22,
        padding: "0 10px",
        borderRadius: 999,
        background,
        color: foreground,
        display: "inline-flex",
        alignItems: "center",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
      }}
    >
      {label}
    </span>
  );
}

function stageLabel(stage: "pre_opening" | "journalizing" | "post_closing") {
  if (stage === "pre_opening") return "開始前";
  if (stage === "journalizing") return "記帳中";
  return "決算後";
}
