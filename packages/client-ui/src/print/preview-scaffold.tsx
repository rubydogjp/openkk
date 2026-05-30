"use client";

import { useRouter } from "next/navigation";

import { palette } from "../shared/design-tokens";
import type { PrintOrientation } from "@rubydogjp/openkk-client-domain";

export type PreviewScaffoldProps = {
  title: string;
  orientation: PrintOrientation;
  notice: string;
  bodyHtml: string;
  onPrint: () => void;
  fpName?: string | null;
};

export function PreviewScaffold({
  title,
  notice,
  bodyHtml,
  onPrint,
  fpName,
}: PreviewScaffoldProps) {
  const router = useRouter();

  function handleClose() {
    if (typeof window !== "undefined" && (window.history.length <= 1 || window.opener)) {
      window.close();
    } else {
      router.back();
    }
  }

  return (
    <>
      <style>{`
        .bk-preview-frame .bk-page {
          margin: 0 auto 20px;
          border: 1px solid ${palette.borderSubtle};
          box-shadow: 0 1px 0 rgba(0,0,0,0.04);
        }
      `}</style>

      <div style={toolbarStyle}>
        <button type="button" onClick={handleClose} style={navBtnStyle}>✕ 閉じる</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: palette.textSoft }}>
          {title}{fpName ? ` — ${fpName}` : ""}
        </span>
        <button type="button" onClick={onPrint} style={printBtnStyle}>
          🖨 印刷 / PDF保存
        </button>
      </div>

      <div style={noticeStyle}>{notice}</div>

      <div
        className="bk-preview-frame"
        style={{ background: palette.headerSurface, padding: 16, minHeight: "calc(100vh - 88px)" }}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </>
  );
}

const toolbarStyle: React.CSSProperties = {
  background: palette.formGroupBg,
  borderBottom: `1px solid ${palette.borderSubtle}`,
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const noticeStyle: React.CSSProperties = {
  background: palette.formGroupBg,
  padding: "8px 16px",
  borderBottom: `1px solid ${palette.borderSubtle}`,
  fontSize: 12,
  color: palette.textSoft,
  fontWeight: 500,
};

const navBtnStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.surface,
  color: palette.textSoft,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const printBtnStyle: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 8,
  border: "none",
  background: palette.action,
  color: palette.surface,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
