import type { ReactNode } from "react";
import {
  OpenkkShellLayout,
  fontSize,
  palette,
} from "@rubydogjp/openkk-frontend-ui";

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
        デモ版で入力した内容は、再読み込みするとサンプルデータに戻ります。
      </div>
      {children}
    </OpenkkShellLayout>
  );
}
