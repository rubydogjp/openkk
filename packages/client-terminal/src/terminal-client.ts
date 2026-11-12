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
    const appError = AppError.from(error, {
      fallbackUserMessage: "処理に失敗しました",
      fallbackDeveloperMessage: "cli: command failed",
      statusCode: null,
    });
    io.stderr(`エラー: ${appError.messageForUser}\n`);
    return EXIT_FAILURE;
  }
}

function usage(product: TerminalProduct): string {
  return `${product.title}

使い方:
  ${CLI_COMMAND_NAME} [--file <path>] <command>

${CLI_COMMAND_USAGE}

オプション:
  --file <path>   帳簿ファイル (既定: 環境変数 ${product.bookFileEnv}、なければ ./${product.defaultBookFile})
  --user <id>     データの持ち主 (既定: ${product.defaultUserId})
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
  const files: CliFiles = {
    resolve: (target) => path.resolve(io.cwd, target),
    exists: (filePath) => fs.existsSync(filePath),
    readBytes: (filePath) => new Uint8Array(fs.readFileSync(filePath)),
    writeText: (filePath, text) => fs.writeFileSync(filePath, text),
    writeBytes: (filePath, bytes) => fs.writeFileSync(filePath, bytes),
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
  try {
    const parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        file: text,
        user: text,
        ...Object.fromEntries(CLI_STRING_OPTIONS.map((name) => [name, text])),
        ...Object.fromEntries(CLI_FLAG_OPTIONS.map((name) => [name, flag])),
        help: { type: "boolean", short: "h" },
        version: flag,
      },
    });
    return { values: parsed.values, positionals: parsed.positionals };
  } catch (error) {
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
}
