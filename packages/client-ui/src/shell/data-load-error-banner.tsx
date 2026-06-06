"use client";

import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkEntries,
} from "@rubydogjp/openkk-client-usecases";

import { AppErrorText } from "../shared/app-error-text";
import { fontSize, fontWeight, palette, radii } from "../shared/design-tokens";

const LOAD_ERROR_FALLBACK_MESSAGE =
  "データの読み込みに失敗しました。再読み込みしてください。";

export function DataLoadErrorBanner() {
  const appState = useOpenkkAppState();
  const entries = useOpenkkEntries();
  const assist = useOpenkkAssist();

  const failedSources = [
    {
      error: appState.fiscalPeriodLoadError,
      reload: appState.reloadFiscalPeriods,
    },
    { error: entries.loadError, reload: entries.reload },
    { error: assist.loadError, reload: assist.reload },
  ].filter((source) => source.error != null);

  if (failedSources.length === 0) return null;

  const reloadFailed = () => {
    for (const source of failedSources) source.reload();
  };

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: palette.dangerBg,
        borderBottom: `1px solid ${palette.dangerBorder}`,
      }}
    >
      <AppErrorText
        error={failedSources[0]!.error}
        fallbackUserMessage={LOAD_ERROR_FALLBACK_MESSAGE}
        style={{ flex: 1 }}
      />
      <button
        type="button"
        onClick={reloadFailed}
        style={{
          flexShrink: 0,
          padding: "6px 14px",
          borderRadius: radii.sm,
          border: `1px solid ${palette.danger}`,
          background: palette.surface,
          color: palette.danger,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          cursor: "pointer",
        }}
      >
        再読み込み
      </button>
    </div>
  );
}
