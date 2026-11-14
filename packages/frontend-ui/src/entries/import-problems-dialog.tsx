"use client";

import { useId, useRef } from "react";

import type { JournalTableProblem } from "@rubydogjp/openkk-driver";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  typography,
} from "../shared/design-tokens.js";
import { useModalLifecycle } from "../shared/dismissible-layer.js";
import { ErrorIcon } from "../shared/icons.js";

const DIALOG_MAX_WIDTH = 560;
const PROBLEM_ROW_HEIGHT = 36;
const VISIBLE_PROBLEM_ROWS = 5;
const ROW_NUMBER_WIDTH = 64;

export function ImportProblemsDialog(props: {
  problems: JournalTableProblem[];
  onClose: () => void;
}) {
  const { problems, onClose } = props;
  const titleId = useId();
  const bodyId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalLifecycle<HTMLDivElement>(onClose, closeButtonRef);
  const hiddenRowCount = problems.length - VISIBLE_PROBLEM_ROWS;

  return (
    <>
      <div
        className="bk-dialog-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.28)",
          zIndex: 9998,
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
        <div
          ref={dialogRef}
          className="bk-dialog-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          style={{
            width: "100%",
            maxWidth: DIALOG_MAX_WIDTH,
            background: palette.surface,
            borderRadius: 24,
            padding: "24px 24px 22px",
            boxShadow: shadows.popup,
            pointerEvents: "all",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: radii.pill,
                background: palette.dangerBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ErrorIcon size={26} color={palette.danger} />
            </div>
            <div
              id={titleId}
              style={{
                fontSize: typography.dialogTitle.fontSize,
                fontWeight: fontWeight.bold,
                color: palette.text,
              }}
            >
              CSV を取り込めません
            </div>
          </div>
          <p
            id={bodyId}
            style={{
              margin: "16px 0 0",
              fontSize: fontSize.md,
              lineHeight: 1.65,
              color: palette.textSoft,
              fontWeight: fontWeight.medium,
            }}
          >
            読めない行があります。何も変えていません。
          </p>
          <ul
            aria-label="読めない行"
            style={{
              margin: "14px 0 0",
              padding: 0,
              listStyle: "none",
              border: `1px solid ${palette.borderStrong}`,
              maxHeight: PROBLEM_ROW_HEIGHT * VISIBLE_PROBLEM_ROWS,
              overflowY: "auto",
              fontSize: fontSize.base,
              color: palette.text,
            }}
          >
            {problems.map((problem, index) => (
              <li
                key={index}
                style={{
                  display: "grid",
                  gridTemplateColumns: `${ROW_NUMBER_WIDTH}px 1fr`,
                  gap: 8,
                  alignItems: "center",
                  minHeight: PROBLEM_ROW_HEIGHT,
                  boxSizing: "border-box",
                  padding: "7px 12px",
                  borderBottom:
                    index === problems.length - 1
                      ? "none"
                      : `1px solid ${palette.borderStrong}`,
                }}
              >
                <b
                  style={{
                    fontWeight: fontWeight.bold,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {problem.rowNumber} 行目
                </b>
                <span>{problem.message}</span>
              </li>
            ))}
          </ul>
          {hiddenRowCount > 0 ? (
            <div
              style={{
                marginTop: 8,
                fontSize: fontSize.sm,
                color: palette.textSoft,
              }}
            >
              ほか {hiddenRowCount} 行 (中をスクロール)
            </div>
          ) : null}
          <div
            style={{
              marginTop: 22,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              style={{
                height: sizes.button.formHeight,
                minWidth: sizes.button.formPrimaryMinWidth,
                padding: "0 18px",
                borderRadius: radii.sm,
                border: "none",
                background: palette.brand,
                color: palette.surface,
                ...typography.control,
                fontWeight: fontWeight.bold,
                cursor: "pointer",
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
