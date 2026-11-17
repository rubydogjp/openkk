import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { AppError } from "@rubydogjp/openkk-driver";
import {
  CLI_COMMAND_NAME,
  CLI_COMMAND_OPTION_USAGE,
  CLI_COMMAND_USAGE,
  CLI_FLAG_OPTIONS,
  CLI_STRING_OPTIONS,
  CliUsageError,
  createCliOutput,
  isReadOnlyCliCommand,
  printableTerminalText,
  readCliOptions,
  runCliCommand,
  type CliBook,
  type CliFiles,
  type CliOutput,
} from "@rubydogjp/openkk-frontend-cli";

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const HELP_COMMAND = "help";
const INTERNAL_FAILURE_STATUS = 500;
const INTERNAL_FAILURE_MESSAGE =
  "帳簿の処理中に思わぬエラーが起きました。帳簿ファイルのコピーを取ってから、もう一度試してください";
const FILE_ERROR_MESSAGES = new Map<string, string>([
  ["ENOENT", "ファイルがありません"],
  ["EACCES", "ファイルを読み書きする権限がありません"],
  ["EPERM", "ファイルを読み書きする権限がありません"],
  ["EISDIR", "ファイルではなくフォルダが指定されています"],
  ["EROFS", "読み取り専用の場所なので書き込めません"],
  ["ENOSPC", "ディスクの空きが足りません"],
]);

export type TerminalIo = {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd: string;
  env(name: string): string | null;
  now(): Date;
};

export type TerminalProduct = {
  title: string;
  version: string;
  defaultBookFile: string;
  bookFileEnv: string;
  defaultUserId: string;
  openBook(filePath: string, userId: string): Promise<CliBook>;
};

export async function runTerminalClient(
  argv: readonly string[],
  io: TerminalIo,
  product: TerminalProduct,
): Promise<number> {
  const output = createCliOutput(io.stdout);
  try {
    return await dispatch(argv, io, output, product);
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(`${error.message}\n\n${usage(product)}\n`);
      return EXIT_USAGE;
    }
    io.stderr(`エラー: ${printableTerminalText(failureMessage(error))}\n`);
    return EXIT_FAILURE;
  }
}

function failureMessage(error: unknown): string {
  const fileProblem = describeFileError(error);
  if (fileProblem != null) return fileProblem;
  const appError = AppError.from(error, {
    fallbackUserMessage: null,
    fallbackDeveloperMessage: "cli: command failed",
    statusCode: null,
  });
  if (
    appError.statusCode == null
      ? !isAppErrorShaped(error)
      : appError.statusCode >= INTERNAL_FAILURE_STATUS
  ) {
    return INTERNAL_FAILURE_MESSAGE;
  }
  return appError.messageForUser;
}

function isAppErrorShaped(error: unknown): boolean {
  return (
    error instanceof AppError ||
    (error != null &&
      typeof error === "object" &&
      "messageForUser" in error &&
      typeof error.messageForUser === "string")
  );
}

function describeFileError(error: unknown): string | null {
  if (!(error instanceof Error) || !("code" in error)) return null;
  const message =
    typeof error.code === "string" ? FILE_ERROR_MESSAGES.get(error.code) : null;
  if (message == null) return null;
  return "path" in error && typeof error.path === "string"
    ? `${message}: ${error.path}`
    : message;
}

function usage(product: TerminalProduct): string {
  return `${product.title}

使い方:
  ${CLI_COMMAND_NAME} [--file <path>] <command>

${CLI_COMMAND_USAGE}

オプション:
  --file <path>   帳簿ファイル (既定: 環境変数 ${product.bookFileEnv}、なければ ./${product.defaultBookFile})
  --user <id>     データの持ち主 (既定: ${product.defaultUserId}。無印版で開くファイルには付けない)
${CLI_COMMAND_OPTION_USAGE}
  --help          この説明を出す
  --version       版を出す`;
}

async function dispatch(
  argv: readonly string[],
  io: TerminalIo,
  output: CliOutput,
  product: TerminalProduct,
): Promise<number> {
  const { values, positionals } = parseTerminalArgs(argv);
  if (values.version === true) {
    output.line(product.version);
    return EXIT_OK;
  }
  const [command, ...args] = positionals;
  if (values.help === true || command == null || command === HELP_COMMAND) {
    output.line(usage(product));
    return EXIT_OK;
  }
  const textValue = (name: string): string | null => {
    const value = values[name];
    return typeof value === "string" ? value : null;
  };
  const userId = textValue("user") ?? product.defaultUserId;
  if (
    userId !== product.defaultUserId &&
    !isReadOnlyCliCommand(command, args)
  ) {
    io.stderr(
      `注意: --user ${printableTerminalText(userId)} で書いた期間は、無印版で開くと見えません\n`,
    );
  }
  const files: CliFiles = {
    resolve: (target) => path.resolve(io.cwd, target),
    exists: (filePath) => fs.existsSync(filePath),
    readBytes: (filePath) => new Uint8Array(fs.readFileSync(filePath)),
    writeText: (filePath, text) => fs.writeFileSync(filePath, text),
    writeBytes: (filePath, bytes) => fs.writeFileSync(filePath, bytes),
    remove: (filePath) => fs.rmSync(filePath, { force: true }),
  };
  await runCliCommand(
    {
      command,
      args,
      options: readCliOptions(textValue, (name) => values[name] === true),
    },
    {
      bookPath: files.resolve(
        textValue("file") ??
          io.env(product.bookFileEnv) ??
          product.defaultBookFile,
      ),
      output,
      files,
      books: { open: (filePath) => product.openBook(filePath, userId) },
      today: () => io.now(),
    },
  );
  return EXIT_OK;
}

type TerminalArgs = {
  values: Record<string, string | boolean>;
  positionals: string[];
};

function parseTerminalArgs(argv: readonly string[]): TerminalArgs {
  const text = { type: "string" } as const;
  const flag = { type: "boolean" } as const;
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      tokens: true,
      options: {
        file: text,
        user: text,
        ...Object.fromEntries(CLI_STRING_OPTIONS.map((name) => [name, text])),
        ...Object.fromEntries(CLI_FLAG_OPTIONS.map((name) => [name, flag])),
        help: { type: "boolean", short: "h" },
        version: flag,
      },
    });
  } catch (error) {
    throw new CliUsageError(argumentProblemMessage(error));
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) {
      throw new CliUsageError(
        `--${token.name} が 2 回あります。1 回にしてください`,
      );
    }
    seen.add(token.name);
  }
  return { values: parsed.values, positionals: parsed.positionals };
}

function argumentProblemMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : null;
  const option = /'(-{1,2}[^' ]+)/.exec(message)?.[1] ?? null;
  if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    return `${printableTerminalText(option ?? "")} というオプションはありません`;
  }
  if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" && option != null) {
    if (message.includes("ambiguous")) {
      return `${option} の値が - で始まるときは ${option}=-割引 のように = でつないで書いてください`;
    }
    if (message.includes("does not take an argument")) {
      return `${option} には値を付けません`;
    }
    return `${option} のあとに値を書いてください`;
  }
  return "引数を読めませんでした";
}
