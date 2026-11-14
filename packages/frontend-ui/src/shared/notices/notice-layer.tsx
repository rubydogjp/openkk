"use client";

import { useSyncExternalStore } from "react";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
} from "../design-tokens.js";
import {
  CheckCircleFilledIcon,
  CloseIcon,
  CrossCircleFilledIcon,
  WarningTriangleFilledIcon,
} from "../icons.js";
import type { Notice, NoticeBoard, NoticeTone } from "./notice-board.js";

const NOTICE_ICON_SIZE = 20;
const NOTICE_CLOSE_MARK_SIZE = 16;
const NOTICE_MIN_HEIGHT = 48;
const NOTICE_MAX_WIDTH = 560;
const WARNING_ICON_COLORS = {
  fill: "#FACC15",
  edge: "#A16207",
  mark: "#422006",
};
const NO_NOTICES: ReadonlyArray<Notice> = [];

function NoticeToneIcon(props: { tone: NoticeTone }) {
  switch (props.tone) {
    case "success":
      return (
        <CheckCircleFilledIcon
          size={NOTICE_ICON_SIZE}
          color={palette.success}
          markColor={palette.surface}
        />
      );
    case "warning":
      return (
        <WarningTriangleFilledIcon
          size={NOTICE_ICON_SIZE}
          color={WARNING_ICON_COLORS.fill}
          edgeColor={WARNING_ICON_COLORS.edge}
          markColor={WARNING_ICON_COLORS.mark}
        />
      );
    case "danger":
      return (
        <CrossCircleFilledIcon
          size={NOTICE_ICON_SIZE}
          color={palette.danger}
          markColor={palette.surface}
        />
      );
  }
}

function NoticeCard(props: { notice: Notice; onDismiss: () => void }) {
  const { notice } = props;
  const endsWithControl = notice.action != null || notice.closable;
  return (
    <div
      role={notice.tone === "danger" ? "alert" : "status"}
      data-notice-tone={notice.tone}
      style={{
        pointerEvents: "auto",
        width: "100%",
        maxWidth: NOTICE_MAX_WIDTH,
        minHeight: NOTICE_MIN_HEIGHT,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: endsWithControl ? "5px 6px 5px 14px" : "5px 14px",
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.borderStrong}`,
        borderRadius: radii.sm,
        boxShadow: shadows.popup,
        fontSize: fontSize.md,
        lineHeight: 1.45,
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>
        <NoticeToneIcon tone={notice.tone} />
      </span>
      <span style={{ flex: 1, minWidth: 0, padding: "5px 0" }}>
        {notice.message}
      </span>
      {notice.action != null ? (
        <button
          type="button"
          className="bk-notice-action"
          onClick={notice.action.run}
          style={{
            flexShrink: 0,
            minWidth: sizes.button.compactMinWidth,
            padding: "0 14px",
            borderRadius: radii.sm,
            border: `1px solid ${palette.borderStrong}`,
            color: palette.text,
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {notice.action.label}
        </button>
      ) : null}
      {notice.closable ? (
        <button
          type="button"
          className="bk-notice-close"
          aria-label="閉じる"
          onClick={props.onDismiss}
          style={{
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            padding: 0,
            border: "none",
            borderRadius: radii.sm,
            cursor: "pointer",
          }}
        >
          <CloseIcon size={NOTICE_CLOSE_MARK_SIZE} color={palette.textLabel} />
        </button>
      ) : null}
    </div>
  );
}

export function NoticeStack(props: {
  notices: ReadonlyArray<Notice>;
  onDismiss: (key: string) => void;
}) {
  return (
    <div className="bk-notice-layer">
      {props.notices.map((notice) => (
        <NoticeCard
          key={notice.key}
          notice={notice}
          onDismiss={() => props.onDismiss(notice.key)}
        />
      ))}
    </div>
  );
}

export function NoticeLayer(props: { board: NoticeBoard }) {
  const { board } = props;
  const notices = useSyncExternalStore(
    board.subscribe,
    board.getState,
    () => NO_NOTICES,
  );
  return <NoticeStack notices={notices} onDismiss={board.dismiss} />;
}
