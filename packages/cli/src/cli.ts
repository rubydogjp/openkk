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
import type { CliCommandContext } from "./command-context.js";
import { runArchiveCommand } from "./archive.js";
import { runClosingCommand } from "./closing.js";
import { runEntriesCommand } from "./entries.js";
import { runOpeningCommand } from "./opening.js";
import { runPeriodsCommand } from "./periods.js";
import { runReportCommand } from "./report.js";

export const DEFAULT_CLI_FILE = "openkk.sqlite3";
export const DEFAULT_CLI_USER_ID = "openkk-original-user";
export const CLI_FILE_ENV = "OPENKK_FILE";

const COMMANDS = new Map<string, (context: CliCommandContext) => Promise<void>>(
  [
    ["periods", runPeriodsCommand],
    ["opening", runOpeningCommand],
    ["entries", runEntriesCommand],
    ["closing", runClosingCommand],
    ["report", runReportCommand],
    ["archive", runArchiveCommand],
  ],
);

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
  periods receive <id>                   本締め後の書類を受け取った印を付ける
  periods next <id> [--name] [--start] [--end]
                                         期末のBSと固定資産を引き継いで次の期間を作る
  opening show <期間id>                  期首のBS
  opening set <期間id> <科目>=<金額> ...  期首のBSを保存する (例: 現金=100000 元入金=100000)
  entries list <期間id>                  仕訳の一覧
  entries add <期間id> --date <YYYY-MM-DD> --debit <科目> --credit <科目> --amount <金額>
          --description <摘要> [--business-rate <0〜100>]
                                         借方・貸方 1 組の仕訳を足す
  entries import <期間id> <file.csv|file.json>
                                         仕訳を取り込む (同じ localId は飛ばす)
  entries export <期間id> [--format csv|json] [--out <file>]
                                         仕訳を書き出す (既定は CSV を標準出力へ)
  report <期間id> <journal|ledger|fs> [--out <file.html>]
                                         仕訳帳・総勘定元帳・財務諸表を HTML で出す
                                         (本締め前は減価償却などの自動仕訳を含む仮の帳票)
  closing pre <期間id> [--yes]           仮締め (期中は --yes が要る)
  closing cancel <期間id>                仮締めを取り消す
  closing final <期間id> --yes           本締め (取り消せない)
  archive export <期間id> [--out <file.zip>]
                                         会計期間を zip に書き出す (Web 版の圧縮保存と同じ形式)
  archive import <file.zip>              zip を新しい会計期間として取り込む

オプション:
  --file <path>   帳簿ファイル (既定: 環境変数 ${CLI_FILE_ENV}、なければ ./${DEFAULT_CLI_FILE})
  --user <id>     データの持ち主 (既定: ${DEFAULT_CLI_USER_ID})
  --json          結果を JSON で出す
  --yes           確認が要る操作をそのまま実行する
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

  const runCommand = COMMANDS.get(command);
  if (runCommand == null) {
    throw new CliUsageError(`${command} というコマンドはありません`);
  }
  if (!fs.existsSync(filePath)) {
    throw new CliUsageError(
      `帳簿ファイルがありません: ${filePath}\n先に openkk init で作ってください`,
    );
  }
  const backend = await openCliBackend(filePath, userId);
  try {
    await runCommand({
      api: backend.api,
      output,
      args,
      options: {
        name: values.name ?? null,
        start: values.start ?? null,
        end: values.end ?? null,
        date: values.date ?? null,
        debit: values.debit ?? null,
        credit: values.credit ?? null,
        amount: values.amount ?? null,
        description: values.description ?? null,
        businessRate: values["business-rate"] ?? null,
        format: values.format ?? null,
        out: values.out ?? null,
        json: values.json ?? false,
        yes: values.yes ?? false,
      },
      resolvePath: (target) => path.resolve(io.cwd, target),
      today: () => io.now(),
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
        date: { type: "string" },
        debit: { type: "string" },
        credit: { type: "string" },
        amount: { type: "string" },
        description: { type: "string" },
        "business-rate": { type: "string" },
        format: { type: "string" },
        out: { type: "string" },
        json: { type: "boolean" },
        yes: { type: "boolean" },
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
