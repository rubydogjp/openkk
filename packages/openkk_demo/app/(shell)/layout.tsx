import type { ReactNode } from "react";
import { OpenkkShellLayout, fontSize, palette } from "@rubydogjp/openkk-client";

export default function DemoShellLayout({ children }: { children: ReactNode }) {
  return (
    <OpenkkShellLayout>
      <div
        role="note"
        style={{
          padding: "10px 24px",
          background: palette.warningBg,
          borderBottom: `1px solid ${palette.warningBorder}`,
          color: palette.text,
          fontSize: fontSize.sm,
          lineHeight: 1.6,
          flexShrink: 0,
        }}
      >
        デモ版の操作内容は保存されません。再読み込みするとサンプルデータに戻ります。
      </div>
      {children}
    </OpenkkShellLayout>
  );
}
