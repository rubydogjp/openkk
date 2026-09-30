"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation.js";

import {
  usePlatformAdapter,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";

import {
  palette,
  fontSize,
  fontWeight,
  fontFamily,
} from "../../shared/design-tokens.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";

const INSTALL_AVAILABILITY_TIMEOUT_MS = 2500;

type Phase =
  | "checking"
  | "ready"
  | "installing"
  | "installed"
  | "dismissed"
  | "unsupported";

const phaseMessage: Record<Phase, string> = {
  checking: "ホーム画面に追加できるか確認しています。",
  ready: "この環境では、下のボタンからホーム画面に追加できます。",
  installing: "ブラウザの案内に沿って、ホーム画面への追加を進めてください。",
  installed: "ホーム画面に追加済みです。追加したアイコンから起動できます。",
  dismissed: "ホーム画面への追加をキャンセルしました。このままブラウザで使えます。",
  unsupported: "このブラウザでは、このページのボタンから追加を始められません。ブラウザのメニューに「アプリをインストール」や「ホーム画面に追加」がある場合は、そこから追加できます。",
};

export function InstallPage() {
  const router = useRouter();
  const openkkConfig = useOpenkkConfig();
  const appInstall = usePlatformAdapter().appInstall;
  const bundleLabel = openkkConfig.bundleLabel;
  const [phase, setPhase] = useState<Phase>("checking");
  const installLock = useRef(new ExclusiveActionLock());

  useEffect(() => {
    const evaluateInstallAvailability = () => {
      const state = appInstall.getState();
      if (state === "installed") {
        setPhase("installed");
        return;
      }
      if (state === "available") {
        setPhase("ready");
      }
    };
    evaluateInstallAvailability();
    const unsubscribe = appInstall.subscribe(evaluateInstallAvailability);

    const unsupportedDetectionTimer = window.setTimeout(() => {
      setPhase((p) => (p === "checking" ? "unsupported" : p));
    }, INSTALL_AVAILABILITY_TIMEOUT_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(unsupportedDetectionTimer);
    };
  }, [appInstall]);

  async function handleInstall() {
    if (phase !== "ready") return;
    const release = installLock.current.tryAcquire();
    if (release == null) return;
    setPhase("installing");
    try {
      setPhase(await appInstall.request());
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
        オープン会計をインストール
      </h1>
      {bundleLabel ? (
        <div style={{ fontSize: fontSize.sm, color: palette.textSoft }}>
          {bundleLabel}
        </div>
      ) : null}

      <p style={{ margin: 0, maxWidth: 480, lineHeight: 1.8, color: palette.textSoft }}>
        PCやスマホのホーム画面にアプリを追加し、アイコンからすぐに開けるようにします。
        インストールせずに、ブラウザで使うこともできます。
      </p>
      <p role="status" style={{ margin: "8px 0", maxWidth: 480, lineHeight: 1.8 }}>
        {phaseMessage[phase]}
      </p>

      {phase === "checking" || phase === "ready" || phase === "installing" ? (
        <InstallButton
          onClick={handleInstall}
          disabled={phase === "checking" || phase === "installing"}
          secondary={false}
        >
          {phase === "checking"
            ? "確認中…"
            : phase === "installing"
              ? "追加しています…"
              : "ホーム画面に追加"}
        </InstallButton>
      ) : null}
      <InstallButton
        onClick={() => router.push("/")}
        disabled={phase === "installing"}
        secondary={phase === "checking" || phase === "ready" || phase === "installing"}
      >
        {phase === "installed" ? "アプリを開く" : "ブラウザで開く"}
      </InstallButton>
    </main>
  );
}

function InstallButton({
  children,
  onClick,
  disabled,
  secondary,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  secondary: boolean;
}) {
  const isDisabled = disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      style={{
        height: 48,
        padding: "0 28px",
        borderRadius: 12,
        border: `1px solid ${isDisabled ? palette.borderStrong : palette.brand}`,
        background: isDisabled ? palette.borderStrong : secondary ? palette.surface : palette.brand,
        color: !isDisabled && secondary ? palette.brand : palette.surface,
        fontSize: fontSize.md,
        fontWeight: fontWeight.bold,
        cursor: isDisabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
