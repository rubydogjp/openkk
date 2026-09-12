"use client";

import type { ReactNode } from "react";

import type { FixedAsset } from "@rubydogjp/openkk-client-domain";
import { AmountText } from "../shared/amount-field.js";
import { fontSize, fontWeight, palette, radii, sizes, spacing } from "../shared/design-tokens.js";
import { StepCallout } from "../steps/step-ui.js";
import { AssistBreadcrumb } from "./assist-breadcrumb.js";

export function FixedAssetsScreen(props: {
  items: FixedAsset[];
  readOnly: boolean;
  onAdd: (() => void) | null;
  onOpenItem: ((itemId: string) => void) | null;
  contentMaxWidth: number | null;

  addButtonSlot: ReactNode | null;
}) {
  const isReadOnly = props.readOnly;
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
          maxWidth: props.contentMaxWidth ?? 1040,
          width: "100%",
          margin: "0 auto",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: 22 }}>
          <AssistBreadcrumb current="固定資産" />
        </div>

        {isReadOnly ? (
          <div style={{ marginBottom: 14 }}>
            <StepCallout tone="warning">
              仮締め以降のため、期末時点での状態を表示しています
            </StepCallout>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 14,
          }}
        >
          {isReadOnly ? (
            <LockedAssetButton />
          ) : (
            props.addButtonSlot ?? <AddAssetButton onClick={props.onAdd} />
          )}
        </div>
        <FixedAssetsTable
          items={props.items}
          readOnly={isReadOnly}
          onOpenItem={isReadOnly ? null : props.onOpenItem}
          fillHeight
        />
      </div>
    </section>
  );
}

function FixedAssetsTable(props: {
  items: FixedAsset[];
  readOnly: boolean;
  onOpenItem: ((itemId: string) => void) | null;
  fillHeight: boolean;
}) {
  const isEmpty = props.items.length === 0;
  const { fillHeight } = props;
  const isReadOnly = props.readOnly;
  return (
    <div
      style={{
        background: palette.surface,

        border: `1px solid ${palette.borderEmphasis}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        height: fillHeight ? "100%" : undefined,
        display: "flex",
        flexDirection: "column",
        minHeight: 320,
      }}
    >
      <style>{`
        .bk-fa-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .bk-fa-scroll::-webkit-scrollbar-track { background: transparent; }
        .bk-fa-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-fa-scroll::-webkit-scrollbar-thumb:hover {
          background: #94A3B8;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-fa-row { transition: background 80ms ease; }
        .bk-fa-row.is-clickable { cursor: pointer; }
        .bk-fa-row.is-clickable:hover { background: ${palette.hoverStrong} !important; }
      `}</style>
      {isEmpty ? (
        <FixedAssetsEmptyState readOnly={isReadOnly} />
      ) : (
        <div
          className="bk-fa-scroll"
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
            {props.items.map((asset, index) => (
              <FixedAssetRow
                key={asset.id}
                asset={asset}
                onOpen={props.onOpenItem}
                showDivider={index > 0}
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

function FixedAssetsEmptyState({ readOnly }: { readOnly: boolean }) {
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
          <EmptyFixedAssetIcon />
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: palette.text,
          }}
        >
          まだ固定資産がありません
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: fontSize.sm,
            color: palette.textSoft,
            lineHeight: 1.7,
          }}
        >
          {readOnly
            ? "記録終了後のため、固定資産は追加できません。"
            : "上の「追加」ボタンから 1 件目を登録できます。"}
        </div>
        {readOnly ? (
          <div style={{ marginTop: 16 }}>
            <LockedAssetButton />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyFixedAssetIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <rect
        x={4}
        y={4}
        width={16}
        height={16}
        rx={3}
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
        x1={10}
        y1={10}
        x2={10}
        y2={20}
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function AddAssetButton({ onClick }: { onClick: (() => void) | null }) {
  const disabled = onClick == null;
  return (
    <button
      type="button"
      onClick={onClick ?? undefined}
      disabled={disabled}
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
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
        boxShadow: "0 1px 2px rgba(37, 99, 235, 0.18)",
      }}
    >
      <PlusGlyph /> 追加
    </button>
  );
}

function LockedAssetButton() {
  return (
    <button
      type="button"
      disabled
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactIconTextMinWidth,
        padding: "0 14px",
        borderRadius: radii.sm,
        border: `1px solid ${palette.borderStrong}`,
        background: palette.surface,
        color: palette.textSoft,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: "default",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
      }}
    >
      <LockGlyph /> 記録終了
    </button>
  );
}

function LockGlyph() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 15,
        height: 15,
        display: "block",
        flexShrink: 0,
        backgroundColor: "currentColor",
        maskImage: "url('/icons/lock.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/lock.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
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

function FixedAssetRow(props: {
  asset: FixedAsset;
  onOpen: ((itemId: string) => void) | null;
  showDivider: boolean;
}) {
  const clickable = props.onOpen != null;
  return (
    <button
      type="button"
      onClick={() => props.onOpen?.(props.asset.id)}
      className={`bk-fa-row${clickable ? " is-clickable" : ""}`}
      style={{
        border: "none",
        borderTop: props.showDivider
          ? `1px solid ${palette.borderSubtle}`
          : "none",
        background: palette.surface,
        padding: "14px 16px",
        textAlign: "left",
        width: "100%",
        boxSizing: "border-box",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <FixedAssetCardBody asset={props.asset} />
    </button>
  );
}

function FixedAssetCardBody(props: { asset: FixedAsset }) {
  const asset = props.asset;
  return (
    <div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flex: 1,
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            color: palette.text,
            lineHeight: 1.4,
          }}
        >
          {asset.name}
        </div>
        <StatusChip label={asset.status} />
      </div>

      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: palette.textLabel,
          fontSize: fontSize.sm,
        }}
      >
        <span>{asset.accountName}</span>
        <span>{asset.depreciationStartLabel}</span>
        <span style={{ marginLeft: "auto" }}>
          {asset.remainingDepreciationLabel}
        </span>
      </div>

      <div
        style={{
          marginTop: 12,
          height: 6,
          borderRadius: 999,
          background: palette.brand,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${asset.depreciationProgress * 100}%`,
            background: palette.brandTint,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${asset.depreciationProgress * 55}%`,
            background: palette.borderSubtle,
          }}
        />
        {[25, 50, 75].map((n) => (
          <div
            key={n}
            style={{
              position: "absolute",
              left: `${n}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: palette.surface,
            }}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: fontSize.sm,
            color: palette.textLabel,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          購入額
          <AmountText bold={false} muted={false}>
            {asset.acquisitionCost.toLocaleString("ja-JP")}
          </AmountText>
          円
        </span>
        <span
          style={{
            fontSize: fontSize.sm,
            color: palette.brand,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          現在の価値
          <AmountText bold muted={false}>
            {asset.currentBookValue.toLocaleString("ja-JP")}
          </AmountText>
          円
        </span>
      </div>
    </div>
  );
}

function StatusChip(props: { label: string }) {

  return (
    <div
      style={{
        height: 22,
        padding: "0 10px",
        borderRadius: 999,
        background: palette.brandTint,
        color: palette.brand,
        display: "inline-flex",
        alignItems: "center",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
      }}
    >
      {props.label}
    </div>
  );
}
