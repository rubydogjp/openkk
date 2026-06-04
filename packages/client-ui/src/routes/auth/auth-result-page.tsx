"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { useOpenkkAppState } from "@rubydogjp/openkk-client-usecases";
import { AppErrorText } from "../../shared/app-error-text";
import { fontSize, fontWeight, palette, shadows } from "../../shared/design-tokens";

export function AuthResultPage() {
  const appState = useOpenkkAppState();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [screenError, setScreenError] = useState<unknown>(null);

  useEffect(() => {
    const state = searchParams.get("state") ?? "";
    const code = searchParams.get("code") ?? "";
    if (state.trim() === "" || code.trim() === "") {
      setScreenError(
        new AppError({
          messageForUser: "サインイン結果を確認できませんでした",
          messageForDeveloper: "auth-result: state or code missing",
          originalMessage: null,
          statusCode: null,
        }),
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await appState.completeSignIn({ state, code });
        if (cancelled) return;
        router.replace("/fiscal-periods");
      } catch (error) {
        if (cancelled) return;
        setScreenError(
          AppError.from(error, {
            fallbackUserMessage: "サインインの完了に失敗しました",
            fallbackDeveloperMessage: "auth-result: completeSignIn failed",
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appState, router, searchParams]);

  return (
    <main
      style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: palette.pageBg,
      }}
    >
      <section
        style={{
          width: "min(100%, 440px)",
          padding: 28,
          borderRadius: 12,
          background: palette.surface,
          border: `1px solid ${palette.borderSubtle}`,
          boxShadow: shadows.card,
        }}
      >
        <h1
          style={{
            margin: 0,
            color: palette.text,
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            lineHeight: 1.4,
          }}
        >
          サインインを完了しています
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            color: palette.textSoft,
            fontSize: fontSize.base,
            lineHeight: 1.7,
          }}
        >
          画面が切り替わるまでお待ちください。
        </p>
        {screenError != null ? (
          <div style={{ marginTop: 16 }}>
            <AppErrorText error={screenError} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
