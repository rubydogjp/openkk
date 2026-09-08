"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useOpenkkConfig } from "@rubydogjp/openkk-client-usecases";

import {
  getDeferredInstallPrompt,
  isAppInstalled,
  requestAppInstall,
  subscribeInstallChange,
  takeDeferredInstallPrompt,
} from "../../shared/pwa-install.js";
import {
  palette,
  fontSize,
  fontWeight,
  fontFamily,
} from "../../shared/design-tokens.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";

const INSTALL_AVAILABILITY_TIMEOUT_MS = 2500;

type NavigatorWithExperimentalInstall = Navigator & {
  install: (() => Promise<unknown>) | null;
  standalone: boolean | null;
};

type Phase =
  | "checking"
  | "ready"
  | "installing"
  | "installed"
  | "dismissed"
  | "unsupported";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as NavigatorWithExperimentalInstall).standalone === true
  );
}

function canInstall(): boolean {
  return (
    getDeferredInstallPrompt() != null ||
    typeof (navigator as NavigatorWithExperimentalInstall).install ===
      "function"
  );
}

export function InstallPage() {
  const router = useRouter();
  const openkkConfig = useOpenkkConfig();
  const bundleLabel = openkkConfig.bundleLabel;
  const [phase, setPhase] = useState<Phase>("checking");
  const installLock = useRef(new ExclusiveActionLock());

  useEffect(() => {
    const evaluateInstallAvailability = () => {
      if (isStandalone() || isAppInstalled()) {
        setPhase("installed");
        return;
      }
      if (canInstall()) {
        setPhase("ready");
      }
    };
    evaluateInstallAvailability();
    const unsubscribe = subscribeInstallChange(evaluateInstallAvailability);

    const unsupportedDetectionTimer = window.setTimeout(() => {
      setPhase((p) => (p === "checking" ? "unsupported" : p));
    }, INSTALL_AVAILABILITY_TIMEOUT_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(unsupportedDetectionTimer);
    };
  }, []);

  async function handleInstall() {
    if (phase !== "ready") return;
    const release = installLock.current.tryAcquire();
    if (release == null) return;
    setPhase("installing");
    const prompt = takeDeferredInstallPrompt();
    const nav = navigator as NavigatorWithExperimentalInstall;
    try {
      const outcome = await requestAppInstall({
        prompt,
        install:
          prompt == null && typeof nav.install === "function"
            ? () => nav.install!()
            : null,
      });
      setPhase(outcome);
    } finally {
      release();
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
      ) : phase === "unsupported" || phase === "dismissed" ? (
        <>
          <p
            style={{
              margin: 0,
              fontSize: fontSize.md,
              color: palette.textSoft,
            }}
          >
            {phase === "dismissed"
              ? "ホーム画面への追加をキャンセルしました"
              : "この環境では「ホーム画面に追加」できません"}
          </p>
          <PrimaryButton onClick={() => router.push("/")}>
            このままブラウザで開始
          </PrimaryButton>
        </>
      ) : (
        <PrimaryButton
          onClick={handleInstall}
          disabled={phase === "checking" || phase === "installing"}
        >
          {phase === "checking"
            ? "準備中…"
            : phase === "installing"
              ? "追加しています…"
              : "ホーム画面に追加"}
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
