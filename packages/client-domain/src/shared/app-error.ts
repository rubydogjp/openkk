export type AppErrorLike = {
  messageForDeveloper: string;
  messageForUser: string;
  originalMessage: string | null;
  statusCode: number | null;
  code: string | null;
};

export type AppErrorFromOptions = {
  fallbackUserMessage: string | null;
  fallbackDeveloperMessage: string | null;
  statusCode: number | null;
};

export type AppErrorPatch = {
  messageForDeveloper?: string;
  messageForUser?: string;
  originalMessage?: string | null;
  statusCode?: number | null;
  code?: string | null;
};

export class AppError extends Error implements AppErrorLike {
  readonly messageForDeveloper: string;
  readonly messageForUser: string;
  readonly originalMessage: string | null;
  readonly statusCode: number | null;
  readonly code: string | null;

  constructor(params: AppErrorLike) {
    super(params.messageForDeveloper);
    this.name = "AppError";
    this.messageForDeveloper = params.messageForDeveloper;
    this.messageForUser = params.messageForUser;
    this.originalMessage = params.originalMessage;
    this.statusCode = params.statusCode;
    this.code = params.code;
  }

  static from(error: unknown, options: AppErrorFromOptions): AppError {
    if (error instanceof AppError) {
      return error;
    }
    if (isAppErrorLike(error)) return new AppError(error);
    return new AppError({
      messageForDeveloper:
        options.fallbackDeveloperMessage ??
        "AppError.from: non-AppError was wrapped for safe handling",
      messageForUser: options.fallbackUserMessage ?? "エラーが発生しました",
      originalMessage: stringifyOriginalMessage(error),
      statusCode: options.statusCode ?? null,
      code: null,
    });
  }

  static fromJson(json: Record<string, unknown>): AppError {
    if (!isAppErrorLike(json)) {
      throw new Error("AppError.fromJson: invalid AppError JSON");
    }
    return new AppError(json);
  }

  toJson(): AppErrorLike {
    return {
      messageForDeveloper: this.messageForDeveloper,
      messageForUser: this.messageForUser,
      originalMessage: this.originalMessage,
      statusCode: this.statusCode,
      code: this.code,
    };
  }

  copyWith(params: AppErrorPatch): AppError {
    return new AppError({
      messageForDeveloper:
        params.messageForDeveloper ?? this.messageForDeveloper,
      messageForUser: params.messageForUser ?? this.messageForUser,
      originalMessage:
        params.originalMessage === undefined
          ? this.originalMessage
          : params.originalMessage,
      statusCode:
        params.statusCode === undefined ? this.statusCode : params.statusCode,
      code: params.code === undefined ? this.code : params.code,
    });
  }

  override toString(): string {
    return `AppError(messageForDeveloper: ${this.messageForDeveloper}, messageForUser: ${this.messageForUser}, originalMessage: ${this.originalMessage}, statusCode: ${this.statusCode}, code: ${this.code})`;
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
      code: null,
    });
  }
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
      return JSON.stringify(error) ?? null;
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
    validStatusCode(value.statusCode) &&
    (typeof value.code === "string" || value.code === null)
  );
}
