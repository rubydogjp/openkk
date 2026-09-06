export type AppErrorLike = {
  messageForDeveloper: string;
  messageForUser: string;
  originalMessage: string | null;
  statusCode: number | null;
};

export type AppErrorFromOptions = {
  fallbackUserMessage?: string;
  fallbackDeveloperMessage?: string;
  statusCode?: number | null;
};

export class AppError extends Error implements AppErrorLike {
  readonly messageForDeveloper: string;
  readonly messageForUser: string;
  readonly originalMessage: string | null;
  readonly statusCode: number | null;

  constructor(params: AppErrorLike) {
    const normalized = normalizeAppErrorLike(params);
    super(normalized.messageForDeveloper);
    this.name = "AppError";
    this.messageForDeveloper = normalized.messageForDeveloper;
    this.messageForUser = normalized.messageForUser;
    this.originalMessage = normalized.originalMessage;
    this.statusCode = normalized.statusCode;
  }

  static from(error: unknown, options: AppErrorFromOptions = {}): AppError {
    if (error instanceof AppError) {
      return error;
    }
    if (isAppErrorLike(error)) {
      return new AppError({
        messageForDeveloper: error.messageForDeveloper,
        messageForUser: error.messageForUser,
        originalMessage: error.originalMessage,
        statusCode: error.statusCode,
      });
    }
    return new AppError({
      messageForDeveloper:
        options.fallbackDeveloperMessage ??
        "AppError.from: non-AppError was wrapped for safe handling",
      messageForUser: options.fallbackUserMessage ?? "エラーが発生しました",
      originalMessage: stringifyOriginalMessage(error),
      statusCode: options.statusCode ?? null,
    });
  }

  static fromJson(json: Record<string, unknown>): AppError {
    if (!isAppErrorLike(json)) {
      throw new Error("AppError.fromJson: invalid AppError JSON");
    }
    return new AppError({
      messageForDeveloper: json.messageForDeveloper,
      messageForUser: json.messageForUser,
      originalMessage: json.originalMessage,
      statusCode: json.statusCode,
    });
  }

  toJson(): AppErrorLike {
    return {
      messageForDeveloper: this.messageForDeveloper,
      messageForUser: this.messageForUser,
      originalMessage: this.originalMessage,
      statusCode: this.statusCode,
    };
  }

  copyWith(params: Partial<AppErrorLike>): AppError {
    return new AppError({
      messageForDeveloper:
        typeof params.messageForDeveloper === "string"
          ? params.messageForDeveloper
          : this.messageForDeveloper,
      messageForUser:
        typeof params.messageForUser === "string"
          ? params.messageForUser
          : this.messageForUser,
      originalMessage:
        typeof params.originalMessage === "string" ||
        params.originalMessage === null
          ? params.originalMessage
          : this.originalMessage,
      statusCode:
        validStatusCode(params.statusCode) ? params.statusCode : this.statusCode,
    });
  }

  override toString(): string {
    return `AppError(messageForDeveloper: ${this.messageForDeveloper}, messageForUser: ${this.messageForUser}, originalMessage: ${this.originalMessage}, statusCode: ${this.statusCode})`;
  }
}

export function jsonToAppError(json: Record<string, unknown>): AppError {
  try {
    return AppError.fromJson(json);
  } catch (error) {
    return new AppError({
      messageForDeveloper: `jsonToAppError.error jsonMap: ${safeDiagnosticText(json)}`,
      messageForUser: "エラー情報の解析に失敗しました",
      originalMessage: stringifyOriginalMessage(error),
      statusCode: null,
    });
  }
}

function normalizeAppErrorLike(value: AppErrorLike): AppErrorLike {
  const candidate: Partial<AppErrorLike> = isObject(value) ? value : {};
  return {
    messageForDeveloper:
      typeof candidate.messageForDeveloper === "string"
        ? candidate.messageForDeveloper
        : "AppError: invalid developer message",
    messageForUser:
      typeof candidate.messageForUser === "string"
        ? candidate.messageForUser
        : "エラーが発生しました",
    originalMessage:
      typeof candidate.originalMessage === "string" ||
      candidate.originalMessage === null
        ? candidate.originalMessage
        : null,
    statusCode: validStatusCode(candidate.statusCode)
      ? candidate.statusCode
      : null,
  };
}

function validStatusCode(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function safeDiagnosticText(value: unknown): string {
  return stringifyOriginalMessage(value) ?? "null";
}

function stringifyOriginalMessage(error: unknown): string | null {
  try {
    if (error == null) return null;
    if (typeof error === "string") {
      return error.length === 0 ? null : error;
    }
    if (error instanceof Error) {
      return error.message || error.toString();
    }
    if (Array.isArray(error) || isObject(error)) {
      return JSON.stringify(error);
    }
    return String(error);
  } catch {
    return "<unprintable>";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppErrorLike(value: unknown): value is AppErrorLike {
  if (!isObject(value)) return false;
  return (
    typeof value.messageForDeveloper === "string" &&
    typeof value.messageForUser === "string" &&
    (typeof value.originalMessage === "string" ||
      value.originalMessage === null) &&
    validStatusCode(value.statusCode)
  );
}
