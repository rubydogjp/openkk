"use client";

import { useRouter } from "next/navigation.js";
import { useRef, useState } from "react";

import {
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import { AppError } from "@rubydogjp/openkk-client-domain";

import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";

export function useShellAuthActions() {
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const router = useRouter();
  const [authActionError, setAuthActionError] = useState<unknown>(null);
  const [authActionPending, setAuthActionPending] = useState(false);
  const authActionLock = useRef(new ExclusiveActionLock());

  async function handleSignIn() {
    const release = authActionLock.current.tryAcquire();
    if (release == null) return;
    setAuthActionError(null);
    if (openkkConfig.authMode === "embedded") {
      appState.signInAsEmbeddedUser();
      release();
      return;
    }
    setAuthActionPending(true);
    let navigationStarted = false;
    try {
      const redirectUrl = `${window.location.origin}/auth/result`;
      const result = await appState.startSignIn(redirectUrl);
      window.location.href = result.authUrl;
      navigationStarted = true;
    } catch (error) {
      setAuthActionError(
        AppError.from(error, {
          fallbackUserMessage: "サインインを開始できませんでした",
          fallbackDeveloperMessage: "shell: startSignIn failed",
          statusCode: null,
        }),
      );
    } finally {
      if (!navigationStarted) {
        setAuthActionPending(false);
        release();
      }
    }
  }

  async function handleSignOut() {
    const release = authActionLock.current.tryAcquire();
    if (release == null) return;
    setAuthActionError(null);
    setAuthActionPending(true);
    try {
      await appState.signOut();
    } catch (error) {
      setAuthActionError(
        AppError.from(error, {
          fallbackUserMessage:
            "この端末ではサインアウトしましたが、サーバーへの通知に失敗しました",
          fallbackDeveloperMessage:
            "shell: remote signOut failed after clearing local session",
          statusCode: null,
        }),
      );
    } finally {
      setAuthActionPending(false);
      release();
    }
    router.push("/");
  }

  return {
    authActionError,
    authActionPending,
    signIn: () => void handleSignIn(),
    signOut: () => void handleSignOut(),
  };
}
