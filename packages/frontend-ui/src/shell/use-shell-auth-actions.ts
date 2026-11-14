"use client";

import { useRef, useState } from "react";

import {
  usePlatformAdapter,
  useOpenkkAppState,
  useOpenkkConfig,
} from "../bindings/index.js";
import { AppError } from "@rubydogjp/openkk-driver";

import { debugAppError } from "../shared/app-error-text.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import { useOpenkkNotices } from "../shared/notices/notices.js";
import { useRouter } from "../routing/routing.js";

export function useShellAuthActions() {
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const navigation = usePlatformAdapter().navigation;
  const router = useRouter();
  const notices = useOpenkkNotices();
  const [authActionPending, setAuthActionPending] = useState(false);
  const authActionLock = useRef(new ExclusiveActionLock());

  function showAuthActionFailure(error: AppError) {
    debugAppError(error);
    notices.show({ tone: "danger", message: error.messageForUser });
  }

  async function handleSignIn() {
    const release = authActionLock.current.tryAcquire();
    if (release == null) return;
    if (openkkConfig.authMode === "embedded") {
      appState.signInAsEmbeddedUser();
      release();
      return;
    }
    setAuthActionPending(true);
    let navigationStarted = false;
    try {
      const result = await appState.startSignIn(
        navigation.appUrl("/auth/result"),
        null,
      );
      navigation.leaveTo(result.authUrl);
      navigationStarted = true;
    } catch (error) {
      showAuthActionFailure(
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
    setAuthActionPending(true);
    try {
      await appState.signOut();
    } catch (error) {
      showAuthActionFailure(
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
    authActionPending,
    signIn: () => void handleSignIn(),
    signOut: () => void handleSignOut(),
  };
}
