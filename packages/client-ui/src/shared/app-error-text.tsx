"use client";

import { type CSSProperties, useEffect } from "react";

import { AppError } from "@rubydogjp/openkk-client-domain";

export type AppErrorTextProps = {
  error: unknown;
  style?: CSSProperties;
  fallbackUserMessage?: string;
};

export function AppErrorText(props: AppErrorTextProps) {
  const appError = AppError.from(props.error, {
    fallbackUserMessage: props.fallbackUserMessage,
  });

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
      {appError.messageForUser}
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
