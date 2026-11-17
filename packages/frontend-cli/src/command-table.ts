import { CliUsageError, cliRefusal, type CliOutput } from "./cli-output.js";
import type {
  CliBooks,
  CliCommandContext,
  CliFiles,
  CliOptions,
} from "./command-context.js";
import { runLegacyArchiveCommand } from "./legacy/legacy-archive.js";
import { runClosingCommand } from "./commands/closing.js";
import { runEntriesCommand } from "./commands/entries.js";
import { runOpeningCommand } from "./commands/opening.js";
import { runPeriodsCommand } from "./commands/periods.js";
import { runReportCommand } from "./commands/report.js";

export const CLI_COMMAND_NAME = "openkk";
const INIT_COMMAND = "init";

const COMMANDS = new Map<string, (context: CliCommandContext) => Promise<void>>(
  [
    ["periods", runPeriodsCommand],
    ["opening", runOpeningCommand],
    ["entries", runEntriesCommand],
    ["closing", runClosingCommand],
    ["report", runReportCommand],
    ["archive", runLegacyArchiveCommand],
  ],
);

const ARGUMENT_LIMITS = new Map<string, number>([
  ["periods list", 1],
  ["periods show", 2],
  ["periods create", 1],
  ["periods start", 2],
  ["periods receive", 2],
  ["periods next", 2],
  ["periods export", 2],
  ["opening show", 2],
  ["opening carry", 2],
  ["entries list", 2],
  ["entries add", 2],
  ["entries import", 3],
  ["entries export", 2],
  ["closing pre", 2],
  ["closing cancel", 2],
  ["closing final", 2],
  ["archive import", 2],
  ["report", 2],
]);

const COMMANDS_WITHOUT_JSON = new Set([
  "init",
  "report",
  "closing pre",
  "closing cancel",
  "closing final",
  "entries export",
]);

const READ_ONLY_COMMANDS = new Set([
  "periods list",
  "periods show",
  "opening show",
  "entries list",
  "entries export",
  "report",
]);

export function cliCommandName(command: string, args: string[]): string {
  const [subcommand] = args;
  return command === "report" || command === INIT_COMMAND || subcommand == null
    ? command
    : `${command} ${subcommand}`;
}

export function isReadOnlyCliCommand(command: string, args: string[]): boolean {
  return READ_ONLY_COMMANDS.has(cliCommandName(command, args));
}

function assertJsonIsUsable(invocation: CliInvocation): void {
  if (!invocation.options.json) return;
  const name = cliCommandName(invocation.command, invocation.args);
  if (!COMMANDS_WITHOUT_JSON.has(name)) return;
  throw new CliUsageError(`--json は ${name} では使えません`);
}

function assertNoExtraArguments(invocation: CliInvocation): void {
  const [subcommand] = invocation.args;
  const limit =
    ARGUMENT_LIMITS.get(`${invocation.command} ${subcommand}`) ??
    ARGUMENT_LIMITS.get(invocation.command);
  if (limit == null || invocation.args.length <= limit) return;
  throw new CliUsageError(
    `余分な引数があります: ${invocation.args.slice(limit).join(" ")}`,
  );
}

export const CLI_COMMAND_USAGE = `コマンド:
  init                                   帳簿ファイルを作る
  periods list                           会計期間の一覧
  periods show <id>                      会計期間の詳細
  periods create --name <名称> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
                                         会計期間を作る
  periods start <id>                     会計期間を開始する
  periods receive <id>                   本締め後の書類を受け取った印を付ける
  periods next <id> [--name] [--start] [--end]
                                         期末のBSと固定資産を引き継いで次の期間を作る
  periods next <id> --out <file.openkk> [--name] [--start] [--end]
                                         次の期間を新しい帳簿ファイルに作る
                                         (元の期間が本締めと書類の受け取りを終えていれば引き継ぐ)
  periods export <id> [--out <file.openkk>]
                                         会計期間を 1 冊の帳簿ファイルにバックアップする (中身はその期間だけ)
  opening show <期間id>                  期首のBS
  opening set <期間id> <科目>=<金額> ...  期首のBSを保存する (例: 現金=100000 元入金=100000)
                                         元入金がマイナスなら 元入金=-100000 (△100000 でもよい)
  opening carry <期間id> --from <file.openkk> [--from-period <id>] [--items bs,fixed-assets] [--yes]
                                         別の帳簿ファイルの期間から引き継ぐ (既定は期首のBSだけ。
                                         今ある期首のBSや固定資産を置き換えるときは --yes が要る)
  entries list <期間id>                  仕訳の一覧
  entries add <期間id> --date <YYYY-MM-DD> --debit <科目> --credit <科目> --amount <金額>
          --description <摘要> [--business-rate <0〜100、小数は 2 桁まで>]
                                         借方・貸方 1 組の仕訳を足す
  entries import <期間id> <file.csv> [--yes]
                                         CSV で仕訳を上書きする (仕訳番号で突き合わせ、ファイルにない仕訳は消す。
                                         --yes がなければ違いだけ出す。仕訳番号の列がなければ足すだけ)
  entries import <期間id> <file.json>    JSON や以前の形式の CSV の仕訳を足す (非推奨。同じ localId は飛ばす)
  entries export <期間id> [--format csv|json] [--out <file>]
                                         仕訳を書き出す (既定は CSV を標準出力へ)
  report <期間id> <journal|ledger|fs> [--out <file.html>]
                                         仕訳帳・総勘定元帳・財務諸表を HTML で出す
                                         (本締め前は減価償却などの自動仕訳を含む仮の帳票)
  closing pre <期間id> [--yes]           仮締め (期中は --yes が要る)
  closing cancel <期間id>                仮締めを取り消す
  closing final <期間id> --yes           本締め (取り消せない)
  archive import <file.zip>              以前の圧縮済みファイル (zip) を新しい会計期間として取り込む`;

export const CLI_COMMAND_OPTION_USAGE = `  --json          結果を JSON で出す
  --yes           確認が要る操作をそのまま実行する`;

export type CliInvocation = {
  command: string;
  args: string[];
  options: CliOptions;
};

export type CliEnvironment = {
  bookPath: string;
  output: CliOutput;
  files: CliFiles;
  books: CliBooks;
  today(): Date;
};

export async function runCliCommand(
  invocation: CliInvocation,
  environment: CliEnvironment,
): Promise<void> {
  const { bookPath, output, files, books } = environment;
  assertJsonIsUsable(invocation);
  if (invocation.command === INIT_COMMAND) {
    const existed = files.exists(bookPath);
    (await books.open(bookPath)).close();
    output.line(
      existed
        ? `帳簿ファイルは作成済みです: ${bookPath}`
        : `帳簿ファイルを作りました: ${bookPath}`,
    );
    return;
  }
  const runCommand = COMMANDS.get(invocation.command);
  if (runCommand == null) {
    throw new CliUsageError(`${invocation.command} というコマンドはありません`);
  }
  assertNoExtraArguments(invocation);
  if (!files.exists(bookPath)) {
    throw cliRefusal(
      `帳簿ファイルがありません: ${bookPath}。先に ${CLI_COMMAND_NAME} ${INIT_COMMAND} で作ってください`,
    );
  }
  const book = await books.open(bookPath);
  try {
    await runCommand({
      backend: book.backend,
      bookPath,
      output,
      files,
      books,
      args: invocation.args,
      options: invocation.options,
      today: environment.today,
    });
  } finally {
    book.close();
  }
}
