"use client";

import { useState } from "react";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../shared/app-error-text";

import {
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  typography,
} from "../shared/design-tokens";

export function SignInContent() {
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async () => {
    setScreenError(null);
    if (openkkConfig.authMode === "embedded") {
      appState.signInAsEmbeddedUser();
      return;
    }
    try {
      setSubmitting(true);
      const redirectUrl = `${window.location.origin}/auth/result`;
      const result = await appState.startSignIn(redirectUrl);
      window.location.href = result.authUrl;
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "サインインに失敗しました",
          fallbackDeveloperMessage: "shell: startAuthSession failed",
        }),
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "min(100%, 480px)",
          borderRadius: 12,
          padding: 32,
          background: palette.surface,
          border: `1px solid ${palette.borderSubtle}`,
          boxShadow: shadows.card,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            padding: "4px 10px",
            borderRadius: 999,
            background: palette.brandTint,
            color: palette.brand,
            fontSize: fontSize.xs,
            fontWeight: fontWeight.bold,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {openkkConfig.mode}
        </div>
        <h1
          style={{
            margin: "16px 0 8px",
            fontSize: typography.pageTitle.fontSize,
            lineHeight: 1.2,
            color: palette.text,
            fontWeight: fontWeight.bold,
          }}
        >
          サインイン
        </h1>
        <p
          style={{
            margin: 0,
            color: palette.textSoft,
            lineHeight: 1.7,
            fontSize: fontSize.base,
          }}
        >
          {openkkConfig.authMode === "embedded"
            ? "この端末の組み込みユーザーで起動します（サインアウト不要）。"
            : "この環境のサインインを開始します。"}
        </p>
        <div style={{ height: 20 }} />
        <button
          type="button"
          onClick={handleSignIn}
          style={{
            width: "100%",
            height: sizes.button.ctaHeight,
            minWidth: sizes.button.ctaMinWidth,
            borderRadius: radii.sm,
            border: "none",
            background: palette.brand,
            color: palette.surface,
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.65 : 1,
            boxShadow: shadows.primaryButton,
          }}
          disabled={submitting}
        >
          {submitting ? "処理中…" : "サインイン"}
        </button>
        {screenError != null ? (
          <div style={{ marginTop: 12 }}>
            <AppErrorText error={screenError} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
