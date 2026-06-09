"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useOpenkkConfig } from "@rubydogjp/openkk-client-usecases";

import {
  getDeferredInstallPrompt,
  clearDeferredInstallPrompt,
  isAppInstalled,
  subscribeInstallChange,
} from "../../shared/pwa-install";
import {
  palette,
  fontSize,
  fontWeight,
  fontFamily,
} from "../../shared/design-tokens";

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

function canInstall(): boolean {
  return (
    getDeferredInstallPrompt() != null ||
    typeof (navigator as NavigatorWithInstall).install === "function"
  );
}

export function InstallPage() {
  const router = useRouter();
  const openkkConfig = useOpenkkConfig();
  const bundleLabel = openkkConfig.bundleLabel;
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    const evaluate = () => {
      if (isStandalone() || isAppInstalled()) {
        setPhase("installed");
        return;
      }
      if (canInstall()) {
        setPhase("ready");
      }
    };
    // 既にアプリ全体で捕捉済みの beforeinstallprompt を即反映する。
    evaluate();
    const unsubscribe = subscribeInstallChange(evaluate);

    // 一定時間 installable にならなければ非対応とみなす。
    const timer = window.setTimeout(() => {
      setPhase((p) => (p === "checking" ? "unsupported" : p));
    }, 2500);

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function handleInstall() {
    const prompt = getDeferredInstallPrompt();
    if (prompt != null) {
      await prompt.prompt();
      try {
        await prompt.userChoice;
      } catch {
      }
      clearDeferredInstallPrompt();
      return;
    }
    const nav = navigator as NavigatorWithInstall;
    if (typeof nav.install === "function") {
      try {
        await nav.install();
        setPhase("installed");
      } catch {
      }
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
      {bundleLabel ? (
        <div style={{ fontSize: fontSize.sm, color: palette.textSoft }}>
          {bundleLabel}
        </div>
      ) : null}

      {phase === "installed" ? (
        <>
          <p style={{ margin: 0, fontSize: fontSize.md, color: palette.textSoft }}>
            ホーム画面に追加済みです
          </p>
          <PrimaryButton onClick={() => router.push("/")}>
            アプリを開く
          </PrimaryButton>
        </>
      ) : phase === "unsupported" ? (
        <>
          <p style={{ margin: 0, fontSize: fontSize.md, color: palette.textSoft }}>
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
