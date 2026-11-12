"use client";

import { useId, useRef, useState } from "react";

import { useOpenkkBookFiles, usePlatformAdapter } from "../bindings/index.js";

import { useModalLifecycle } from "../shared/dismissible-layer.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  typography,
} from "../shared/design-tokens.js";

export const BOOK_STORAGE_NOTICE_SEEN_KEY = "openkk.book-storage-notice.seen";

const SEEN_VALUE = "1";

const NOTICE_PARAGRAPHS = [
  "オープン会計は、データをこのブラウザの中に保存します。",
  "ブラウザによっては、7 日ほど開かないとデータが消えることがあります。ブラウザのデータを消したときも失われます。",
  "左上の「保存」を押すと、会計期間のデータをファイルに保存できます。大事なデータは、ときどきファイルに保存してください。保存したファイルは、期間の選択の「ファイル」から取り込めます。",
];

export function BookStorageNotice() {
  const bookFiles = useOpenkkBookFiles();
  const { storage } = usePlatformAdapter();
  const [seen, setSeen] = useState(
    () => storage.getItem(BOOK_STORAGE_NOTICE_SEEN_KEY) === SEEN_VALUE,
  );
  if (bookFiles?.saveTracking == null || seen) return null;
  return (
    <BookStorageNoticeDialog
      onClose={() => {
        storage.setItem(BOOK_STORAGE_NOTICE_SEEN_KEY, SEEN_VALUE);
        setSeen(true);
      }}
    />
  );
}

function BookStorageNoticeDialog(props: { onClose: () => void }) {
  const titleId = useId();
  const bodyId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalLifecycle<HTMLDivElement>(
    props.onClose,
    closeButtonRef,
  );
  return (
    <>
      <div
        className="bk-dialog-backdrop"
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
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          style={{
            width: "100%",
            maxWidth: 480,
            background: palette.surface,
            borderRadius: 24,
            padding: "24px 24px 22px",
            boxShadow: shadows.popup,
            pointerEvents: "all",
          }}
        >
          <div
            id={titleId}
            style={{
              fontSize: typography.dialogTitle.fontSize,
              fontWeight: fontWeight.bold,
              color: palette.text,
            }}
          >
            データの保存について
          </div>
          <div id={bodyId} style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {NOTICE_PARAGRAPHS.map((paragraph) => (
              <p
                key={paragraph}
                style={{
                  margin: 0,
                  fontSize: fontSize.md,
                  lineHeight: 1.65,
                  color: palette.textSoft,
                  fontWeight: fontWeight.medium,
                }}
              >
                {paragraph}
              </p>
            ))}
          </div>
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
              onClick={props.onClose}
              style={{
                height: sizes.button.formHeight,
                minWidth: sizes.button.formPrimaryMinWidth,
                padding: "0 18px",
                borderRadius: radii.sm,
                border: "none",
                background: palette.action,
                color: palette.surface,
                ...typography.control,
                fontWeight: fontWeight.bold,
                cursor: "pointer",
              }}
            >
              わかりました
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
