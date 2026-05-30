"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useBrandConfig } from "@rubydogjp/openkk-client-usecases";

import {
  palette,
  fontSize,
  fontWeight,
  fontFamily,
} from "../../shared/design-tokens";

// beforeinstallprompt は標準 lib に型が無いので最小限で定義する。
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// navigator.install は新しい Web Install API (実験的)。あれば利用する。
type NavigatorWithInstall = Navigator & {
  install?: () => Promise<unknown>;
  standalone?: boolean;
};

type Phase = "checking" | "ready" | "installed" | "unsupported";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as NavigatorWithInstall).standalone === true
  );
}

export function InstallPage() {
  const router = useRouter();
  const brandConfig = useBrandConfig();
  const editionLabel = brandConfig.editionLabel ?? "";
  const [phase, setPhase] = useState<Phase>("checking");
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setPhase("installed");
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setPhase("ready");
    };
    const onInstalled = () => {
      setDeferred(null);
      setPhase("installed");
    };

    window.addEventListener("beforeinstallprompt", onPrompt as EventListener);
    window.addEventListener("appinstalled", onInstalled);

    if (typeof (navigator as NavigatorWithInstall).install === "function") {
      setPhase((p) => (p === "checking" ? "ready" : p));
    }

    const timer = window.setTimeout(() => {
      setPhase((p) => (p === "checking" ? "unsupported" : p));
    }, 2500);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        onPrompt as EventListener,
      );
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  async function handleInstall() {
    const nav = navigator as NavigatorWithInstall;
    if (typeof nav.install === "function") {
      try {
        await nav.install();
        setPhase("installed");
      } catch {
        // ユーザーキャンセル等は無視
      }
      return;
    }
    if (deferred != null) {
      await deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        // ignore
      }
      setDeferred(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        fontFamily: fontFamily.sans,
        color: palette.text,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: fontSize.xl,
          fontWeight: fontWeight.bold,
        }}
      >
        オープン会計
      </h1>
      {editionLabel ? (
        <div style={{ fontSize: fontSize.sm, color: palette.textSoft }}>
          {editionLabel}
        </div>
      ) : null}

      {phase === "installed" ? (
        <>
          <p
            style={{
              margin: 0,
              fontSize: fontSize.md,
              color: palette.textSoft,
            }}
          >
            ホーム画面に追加済みです
          </p>
          <PrimaryButton onClick={() => router.push("/")}>
            アプリを開く
          </PrimaryButton>
        </>
      ) : phase === "unsupported" ? (
        <>
          <p
            style={{
              margin: 0,
              fontSize: fontSize.md,
              color: palette.textSoft,
            }}
          >
            この環境では「ホーム画面に追加」できません
          </p>
          <PrimaryButton onClick={() => router.push("/")}>
            このままブラウザで開始
          </PrimaryButton>
        </>
      ) : (
        <PrimaryButton onClick={handleInstall} disabled={phase === "checking"}>
          {phase === "checking" ? "準備中…" : "ホーム画面に追加"}
        </PrimaryButton>
      )}
    </main>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 48,
        padding: "0 28px",
        borderRadius: 12,
        border: "none",
        background: disabled ? palette.borderStrong : palette.brand,
        color: palette.surface,
        fontSize: fontSize.md,
        fontWeight: fontWeight.bold,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
