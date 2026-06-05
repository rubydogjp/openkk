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
    super(params.messageForDeveloper);
    this.name = "AppError";
    this.messageForDeveloper = params.messageForDeveloper;
    this.messageForUser = params.messageForUser;
    this.originalMessage = params.originalMessage;
    this.statusCode = params.statusCode;
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
        params.messageForDeveloper ?? this.messageForDeveloper,
      messageForUser: params.messageForUser ?? this.messageForUser,
      originalMessage: params.originalMessage ?? this.originalMessage,
      statusCode: params.statusCode ?? this.statusCode,
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
      messageForDeveloper: `jsonToAppError.error jsonMap: ${JSON.stringify(json)}`,
      messageForUser: "エラー情報の解析に失敗しました",
      originalMessage: stringifyOriginalMessage(error),
      statusCode: null,
    });
  }
}

function stringifyOriginalMessage(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === "string") {
    return error.length === 0 ? null : error;
  }
  if (error instanceof Error) {
    return error.message || error.toString();
  }
  if (Array.isArray(error) || isPlainObject(error)) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppErrorLike(value: unknown): value is AppErrorLike {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.messageForDeveloper === "string" &&
    typeof value.messageForUser === "string" &&
    (typeof value.originalMessage === "string" ||
      value.originalMessage === null) &&
    (typeof value.statusCode === "number" || value.statusCode === null)
  );
}
