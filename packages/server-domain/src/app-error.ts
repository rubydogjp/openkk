export type AppErrorLike = {
  messageForDeveloper: string;
  messageForUser: string;
  originalMessage: string | null;
  statusCode: number | null;
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

  static from(error: unknown, options: Partial<AppErrorLike> = {}): AppError {
    if (error instanceof AppError) return error;
    if (isAppErrorLike(error)) {
      return new AppError(error);
    }
    return new AppError({
      messageForDeveloper:
        options.messageForDeveloper ??
        "Server AppError.from: non-AppError was wrapped",
      messageForUser:
        options.messageForUser ?? "サーバー処理でエラーが発生しました",
      originalMessage:
        options.originalMessage ?? stringifyOriginalMessage(error),
      statusCode: options.statusCode ?? null,
    });
  }

  static fromJson(json: Record<string, unknown>): AppError {
    return new AppError({
      messageForDeveloper: String(json.messageForDeveloper),
      messageForUser: String(json.messageForUser),
      originalMessage:
        typeof json.originalMessage === "string" ? json.originalMessage : null,
      statusCode:
        typeof json.statusCode === "number" ? json.statusCode : null,
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
}

export function serverValidationError(
  messageForDeveloper: string,
  messageForUser = "入力内容を確認してください",
): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser,
    originalMessage: null,
    statusCode: 400,
  });
}

export function serverNotFoundError(messageForDeveloper: string): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser: "指定されたデータが見つかりませんでした",
    originalMessage: null,
    statusCode: 404,
  });
}

export function serverConflictError(
  messageForDeveloper: string,
  messageForUser: string,
): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser,
    originalMessage: null,
    statusCode: 409,
  });
}

function stringifyOriginalMessage(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === "string") return error.length === 0 ? null : error;
  if (error instanceof Error) return error.message || error.toString();
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isAppErrorLike(value: unknown): value is AppErrorLike {
  if (typeof value !== "object" || value == null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.messageForDeveloper === "string" &&
    typeof candidate.messageForUser === "string" &&
    (typeof candidate.originalMessage === "string" ||
      candidate.originalMessage === null) &&
    (typeof candidate.statusCode === "number" ||
      candidate.statusCode === null)
  );
}
