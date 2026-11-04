import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { AppError } from "@rubydogjp/openkk-client-domain";

import { openCliBackend } from "./backend.js";
import {
  CliUsageError,
  createCliOutput,
  type CliIo,
  type CliOutput,
} from "./cli-io.js";
import { runPeriodsCommand } from "./periods.js";

export const DEFAULT_CLI_FILE = "openkk.sqlite3";
export const DEFAULT_CLI_USER_ID = "openkk-original-user";
export const CLI_FILE_ENV = "OPENKK_FILE";

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const USAGE = `オープン会計 CLI (ベータ)

使い方:
  openkk [--file <path>] <command>

コマンド:
  init                                   帳簿ファイルを作る
  periods list                           会計期間の一覧
  periods show <id>                      会計期間の詳細
  periods create --name <名称> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
                                         会計期間を作る
  periods start <id>                     会計期間を開始する

オプション:
  --file <path>   帳簿ファイル (既定: 環境変数 ${CLI_FILE_ENV}、なければ ./${DEFAULT_CLI_FILE})
  --user <id>     データの持ち主 (既定: ${DEFAULT_CLI_USER_ID})
  --json          結果を JSON で出す
  --help          この説明を出す
  --version       版を出す`;

export async function runOpenkkCli(
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  const output = createCliOutput(io);
  try {
    return await dispatch(argv, io, output);
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(`${error.message}\n\n${USAGE}\n`);
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

async function dispatch(
  argv: readonly string[],
  io: CliIo,
  output: CliOutput,
): Promise<number> {
  const parsed = parseCliArgs(argv);
  const { values, positionals } = parsed;
  if (values.version) {
    output.line(readCliVersion());
    return EXIT_OK;
  }
  const [command, ...args] = positionals;
  if (values.help || command == null || command === "help") {
    output.line(USAGE);
    return EXIT_OK;
  }
  const filePath = path.resolve(
    io.cwd,
    values.file ?? io.env(CLI_FILE_ENV) ?? DEFAULT_CLI_FILE,
  );
  const userId = values.user ?? DEFAULT_CLI_USER_ID;

  if (command === "init") {
    const existed = fs.existsSync(filePath);
    const backend = await openCliBackend(filePath, userId);
    backend.close();
    output.line(
      existed
        ? `帳簿ファイルは作成済みです: ${filePath}`
        : `帳簿ファイルを作りました: ${filePath}`,
    );
    return EXIT_OK;
  }

  if (command !== "periods") {
    throw new CliUsageError(`${command} というコマンドはありません`);
  }
  if (!fs.existsSync(filePath)) {
    throw new CliUsageError(
      `帳簿ファイルがありません: ${filePath}\n先に openkk init で作ってください`,
    );
  }
  const backend = await openCliBackend(filePath, userId);
  try {
    await runPeriodsCommand({
      api: backend.api,
      output,
      args,
      options: {
        name: values.name ?? null,
        start: values.start ?? null,
        end: values.end ?? null,
        json: values.json ?? false,
      },
    });
  } finally {
    backend.close();
  }
  return EXIT_OK;
}

function parseCliArgs(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        file: { type: "string" },
        user: { type: "string" },
        name: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function readCliVersion(): string {
  const packageJson = createRequire(import.meta.url)("../package.json") as {
    version: string;
  };
  return packageJson.version;
}
