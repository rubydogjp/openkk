"use client";

import { MaintenanceScreen } from "../../../shell/maintenance-content";

export function MaintenancePreviewPage() {
  return (
    <MaintenanceScreen
      title="メンテナンス中"
      message={
        "ただいまシステムメンテナンスを実施しています。\nご不便をおかけしますが、しばらく経ってから再度お試しください。"
      }
    />
  );
}
