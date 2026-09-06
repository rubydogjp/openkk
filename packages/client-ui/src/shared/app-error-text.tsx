"use client";

import { type CSSProperties, useEffect } from "react";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { safeUserErrorMessage } from "./safe-error-message.js";

export type AppErrorTextProps = {
  error: unknown;
  style?: CSSProperties;
  fallbackUserMessage?: string;
};

export function AppErrorText(props: AppErrorTextProps) {
  const message = safeUserErrorMessage(
    props.error,
    props.fallbackUserMessage,
  );

  useEffect(() => {
    debugAppError(props.error);
  }, [props.error]);

  return (
    <p
      style={{
        margin: 0,
        color: "#994636",
        fontSize: 14,
        lineHeight: 1.6,
        ...props.style,
      }}
    >
      {message}
    </p>
  );
}

export function debugAppError(error: unknown): void {
  const appError = AppError.from(error);
  console.error("AppError", {
    messageForDeveloper: appError.messageForDeveloper,
    originalMessage: appError.originalMessage,
    statusCode: appError.statusCode,
  });
}
