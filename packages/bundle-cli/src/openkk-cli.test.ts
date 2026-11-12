import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildFiscalPeriodArchiveZip } from "@rubydogjp/openkk-driver";

import { openCliBook } from "./book.js";
import {
  CLI_FILE_ENV,
  DEFAULT_CLI_FILE,
  DEFAULT_CLI_USER_ID,
  runOpenkkCli,
} from "./index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function workspace() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-cli-"));
  tempDirs.push(cwd);
  const env = new Map<string, string>();
  const run = async (...argv: string[]) => {
    let stdout = "";
    let stderr = "";
    const code = await runOpenkkCli(argv, {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
      cwd,
      env: (name) => env.get(name) ?? null,
      now: () => new Date("2026-12-31T12:00:00"),
    });
    return { code, stdout, stderr };
  };
  return { cwd, env, run };
}

async function startedPeriod(
  run: ReturnType<typeof workspace>["run"],
  year = "2026",
): Promise<string> {
  if (!(await run("periods", "list")).stdout.includes("..")) await run("init");
  const created = await run(
    "periods",
    "create",
    "--name",
    `${year}年分`,
    "--start",
    `${year}-01-01`,
    "--end",
    `${year}-12-31`,
    "--json",
  );
  const id = (JSON.parse(created.stdout) as { id: string }).id;
  await run("periods", "start", id);
  return id;
}

describe("openkk cli", () => {
  it("creates the book file with init and is idempotent", async () => {
    const { cwd, run } = workspace();

    const first = await run("init");
    const second = await run("init");

    expect(first.code).toBe(0);
    expect(first.stdout).toContain("帳簿ファイルを作りました");
    expect(fs.existsSync(path.join(cwd, DEFAULT_CLI_FILE))).toBe(true);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("作成済み");
  });

  it("refuses to open a missing book file outside init", async () => {
    const { cwd, run } = workspace();

    const result = await run("periods", "list");

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("openkk init");
    expect(fs.existsSync(path.join(cwd, DEFAULT_CLI_FILE))).toBe(false);
  });

  it("creates, starts, and lists fiscal periods across separate runs", async () => {
    const { run } = workspace();
    await run("init");

    const created = await run(
      "periods",
      "create",
      "--name",
      "2026年分",
      "--start",
      "2026-01-01",
      "--end",
      "2026-12-31",
      "--json",
    );
    const id = (JSON.parse(created.stdout) as { id: string }).id;
    const started = await run("periods", "start", id);
    const listed = await run("periods", "list");
    const shown = await run("periods", "show", id, "--json");

    expect(created.code).toBe(0);
    expect(started.stdout).toContain("記帳中");
    expect(listed.stdout).toContain(
      `${id}  2026-01-01..2026-12-31  記帳中  2026年分`,
    );
    expect(JSON.parse(shown.stdout)).toMatchObject({
      id,
      name: "2026年分",
      phase: "journalizing",
    });
  });

  it("reports backend validation errors in the user's language", async () => {
    const { run } = workspace();
    await run("init");
    const create = (start: string, end: string) =>
      run(
        "periods",
        "create",
        "--name",
        "期間",
        "--start",
        start,
        "--end",
        end,
      );
    await create("2026-01-01", "2026-12-31");

    const overlapping = await create("2026-06-01", "2027-05-31");

    expect(overlapping.code).toBe(1);
    expect(overlapping.stderr).toMatch(/^エラー: /);
    expect(overlapping.stderr).not.toContain("Error");
  });

  it("reads the book file location from --file or the environment", async () => {
    const { cwd, env, run } = workspace();
    env.set(CLI_FILE_ENV, "from-env.sqlite3");

    await run("init");
    await run("--file", "from-flag.sqlite3", "init");

    expect(fs.existsSync(path.join(cwd, "from-env.sqlite3"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, "from-flag.sqlite3"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, DEFAULT_CLI_FILE))).toBe(false);
  });

  it("adds, lists, exports, and re-imports entries", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);

    const added = await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-04-01",
      "--debit",
      "消耗品費",
      "--credit",
      "普通預金",
      "--amount",
      "12,000",
      "--description",
      "プリンタのインク",
      "--business-rate",
      "80",
    );
    const listed = await run("entries", "list", id);
    const exportedCsv = await run(
      "entries",
      "export",
      id,
      "--out",
      "journal.csv",
    );
    const exportedJson = await run("entries", "export", id, "--format", "json");
    const reimported = await run("entries", "import", id, "journal.csv");
    const csvPath = path.join(cwd, "journal.csv");
    fs.writeFileSync(
      csvPath,
      fs
        .readFileSync(csvPath, "utf8")
        .replaceAll(",12000,", ",15000,")
        .concat(",2026-04-02,消耗品費,500,現金,500,切手,,,,\n"),
    );
    const unconfirmed = await run("entries", "import", id, "journal.csv");
    const replaced = await run("entries", "import", id, "journal.csv", "--yes");
    const relisted = await run("entries", "list", id);

    expect(added.code).toBe(0);
    expect(listed.stdout).toContain(
      "2026-04-01  借 消耗品費 12,000 / 貸 普通預金 12,000  プリンタのインク",
    );
    expect(exportedCsv.stdout).toContain("1 件");
    expect(
      fs
        .readFileSync(path.join(cwd, "journal.csv"), "utf8")
        .startsWith("\uFEFF"),
    ).toBe(true);
    expect(JSON.parse(exportedJson.stdout)).toMatchObject({
      schema: "openkk-journal-v1",
      entries: [{ description: "プリンタのインク", businessRateRatio: 0.8 }],
    });
    expect(reimported.stdout).toContain("CSV は今の仕訳と同じです");
    expect(unconfirmed.code).toBe(2);
    expect(unconfirmed.stderr).toContain(
      "追加 1 件 / 変更 1 件 / 削除 0 件 / そのまま 0 件",
    );
    expect(replaced.stdout).toContain(
      "置き換えました (追加 1 件 / 変更 1 件 / 削除 0 件 / そのまま 0 件)",
    );
    expect(relisted.stdout).toContain(
      "2026-04-01  借 消耗品費 15,000 / 貸 普通預金 15,000  プリンタのインク",
    );
    expect(relisted.stdout).toContain(
      "2026-04-02  借 消耗品費 500 / 貸 現金 500  切手",
    );
  });

  it("adds entries from a CSV in the previous format without replacing", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);
    await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-04-01",
      "--debit",
      "消耗品費",
      "--credit",
      "普通預金",
      "--amount",
      "1000",
      "--description",
      "あとで入力した仕訳",
    );
    fs.writeFileSync(
      path.join(cwd, "old.csv"),
      [
        "localId,date,debit,debitType,debitAmount,credit,creditType,creditAmount,description,businessRate",
        "old-1,2026-03-01,通信費,expense,8000,普通預金,asset,8000,以前の CSV の仕訳,100",
      ].join("\n"),
    );

    const imported = await run("entries", "import", id, "old.csv");
    const listed = await run("entries", "list", id);

    expect(imported.stdout).toContain(
      "以前の形式の CSV なので、足すだけで取り込みました (取込 1 件 / 重複スキップ 0 件)",
    );
    expect(listed.stdout).toContain("以前の CSV の仕訳");
    expect(listed.stdout).toContain("あとで入力した仕訳");
  });

  it("refuses a journal CSV with rows it cannot read", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);
    fs.writeFileSync(
      path.join(cwd, "bad.csv"),
      "日付,借方科目,借方金額,貸方科目,貸方金額\n2026-04-01,消耗品,100,現金,100\n",
    );

    const result = await run("entries", "import", id, "bad.csv", "--yes");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "2 行目: 借方: 勘定科目「消耗品」が見つかりません",
    );
  });

  it("imports a JSON journal into another period", async () => {
    const { cwd, run } = workspace();
    const source = await startedPeriod(run);
    await run(
      "entries",
      "add",
      source,
      "--date",
      "2026-05-10",
      "--debit",
      "普通預金",
      "--credit",
      "売上",
      "--amount",
      "50000",
      "--description",
      "報酬の入金",
    );
    await run(
      "entries",
      "export",
      source,
      "--format",
      "json",
      "--out",
      "j.json",
    );
    const json = JSON.parse(
      fs.readFileSync(path.join(cwd, "j.json"), "utf8"),
    ) as {
      entries: Array<{ date: string }>;
    };
    for (const entry of json.entries) entry.date = "2027-05-10";
    fs.writeFileSync(path.join(cwd, "j.json"), JSON.stringify(json));
    const target = await startedPeriod(run, "2027");

    const imported = await run("entries", "import", target, "j.json", "--json");
    const listed = await run("entries", "list", target, "--json");

    expect(JSON.parse(imported.stdout)).toEqual({ imported: 1, skipped: 0 });
    expect(JSON.parse(listed.stdout)).toMatchObject([
      {
        date: "2027-05-10",
        lines: [{ accountName: "普通預金" }, { accountName: "売上" }],
      },
    ]);
  });

  it("rejects malformed entry input before writing", async () => {
    const { run } = workspace();
    const id = await startedPeriod(run);
    const add = (...extra: string[]) =>
      run(
        "entries",
        "add",
        id,
        "--date",
        "2026-04-01",
        "--debit",
        "消耗品費",
        "--credit",
        "普通預金",
        "--description",
        "テスト",
        ...extra,
      );

    expect((await add("--amount", "0")).code).toBe(2);
    expect(
      (
        await run(
          "entries",
          "add",
          id,
          "--date",
          "2026-04-01",
          "--debit",
          "消耗品費",
          "--credit",
          "普通預金",
          "--amount",
          "100",
        )
      ).code,
    ).toBe(2);
    expect((await add("--amount", "1.5")).code).toBe(2);
    expect((await add("--amount", "100", "--business-rate", "120")).code).toBe(
      2,
    );
    expect(
      (
        await run(
          "entries",
          "add",
          id,
          "--date",
          "2026-04-01",
          "--debit",
          "存在しない科目",
          "--credit",
          "普通預金",
          "--amount",
          "100",
          "--description",
          "テスト",
        )
      ).stderr,
    ).toContain("存在しない科目");
    const partial = await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-04-01",
      "--debit",
      "保険",
      "--credit",
      "預金",
      "--amount",
      "100",
      "--description",
      "部分一致",
    );
    expect(partial.code).toBe(2);
    expect(partial.stderr).toContain("勘定科目「保険」が見つかりません");
    expect((await run("entries", "list", id)).stdout).toContain(
      "仕訳はまだありません",
    );
  });

  it("writes provisional reports that include generated closing entries", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);
    await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-03-15",
      "--debit",
      "普通預金",
      "--credit",
      "売上",
      "--amount",
      "300000",
      "--description",
      "春の案件",
    );
    const book = await openCliBook(
      path.join(cwd, DEFAULT_CLI_FILE),
      DEFAULT_CLI_USER_ID,
    );
    await book.backend.fixedAssets.create(id, {
      name: "ノートパソコン",
      acquisitionDate: "2026-01-10",
      acquisitionCost: 240000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });
    book.close();

    const journal = await run("report", id, "journal");
    const written = await run("report", id, "fs", "--out", "fs.html");
    const fsHtml = fs.readFileSync(path.join(cwd, "fs.html"), "utf8");

    expect(journal.code).toBe(0);
    expect(journal.stdout).toMatch(/^<!doctype html>/i);
    expect(journal.stdout).toContain("春の案件");
    expect(journal.stdout).toContain("減価償却費");
    expect(journal.stdout).toContain("ノートパソコン");
    expect(written.stdout).toContain("財務諸表を書き出しました");
    expect(fsHtml).toContain("300,000");
    expect(fsHtml).toContain("減価償却費");
  });

  it("rejects an unknown report kind", async () => {
    const { run } = workspace();
    const id = await startedPeriod(run);

    const result = await run("report", id, "balance");

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("journal / ledger / fs");
  });

  it("exports one fiscal period into a book file of its own", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);
    await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-07-01",
      "--debit",
      "旅費交通費",
      "--credit",
      "現金",
      "--amount",
      "1,980",
      "--description",
      "電車代",
    );
    await startedPeriod(run, "2027");

    const exported = await run("periods", "export", id);
    const listed = await run(
      "--file",
      "2026年分.openkk",
      "periods",
      "list",
      "--json",
    );
    const bookPeriods = JSON.parse(listed.stdout) as Array<{
      id: string;
      name: string;
      phase: string;
    }>;
    const bookEntries = await run(
      "--file",
      "2026年分.openkk",
      "entries",
      "list",
      bookPeriods[0]?.id ?? "",
    );
    const overwrite = await run("periods", "export", id);
    const sourcePeriods = JSON.parse(
      (await run("periods", "list", "--json")).stdout,
    ) as unknown[];

    expect(exported.code).toBe(0);
    expect(exported.stdout).toContain(path.join(cwd, "2026年分.openkk"));
    expect(bookPeriods.map((period) => [period.name, period.phase])).toEqual([
      ["2026年分", "journalizing"],
    ]);
    expect(bookEntries.stdout).toContain("電車代");
    expect(overwrite.code).toBe(2);
    expect(overwrite.stderr).toContain("すでにファイルがあります");
    expect(sourcePeriods).toHaveLength(2);
  });

  it("imports an archive zip from an earlier version as a new fiscal period", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);
    await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-07-01",
      "--debit",
      "旅費交通費",
      "--credit",
      "現金",
      "--amount",
      "1,980",
      "--description",
      "電車代",
    );

    const book = await openCliBook(
      path.join(cwd, DEFAULT_CLI_FILE),
      DEFAULT_CLI_USER_ID,
    );
    const [period] = await book.backend.fiscalPeriods.getAll();
    fs.writeFileSync(
      path.join(cwd, "2026.zip"),
      await buildFiscalPeriodArchiveZip(
        book.backend,
        period!,
        new Date("2026-12-31T12:00:00"),
        () => {},
      ),
    );
    book.close();
    const removedExport = await run("archive", "export", id);
    const missingBook = await run(
      "--file",
      "missing.sqlite3",
      "archive",
      "import",
      "2026.zip",
    );
    await run("--file", "other.sqlite3", "init");
    const restored = await run(
      "--file",
      "other.sqlite3",
      "archive",
      "import",
      "2026.zip",
      "--json",
    );
    const restoredId = (JSON.parse(restored.stdout) as { id: string }).id;
    const listed = await run(
      "--file",
      "other.sqlite3",
      "entries",
      "list",
      restoredId,
    );

    expect(removedExport.code).toBe(2);
    expect(missingBook.code).toBe(2);
    expect(JSON.parse(restored.stdout)).toMatchObject({
      name: "2026年分",
      phase: "journalizing",
      archiveStatus: "active",
    });
    expect(listed.stdout).toContain(
      "借 旅費交通費 1,980 / 貸 現金 1,980  電車代",
    );
  });

  it("starts the next year in a file of its own and carries over once the year is closed", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);
    await run("opening", "set", id, "現金=100000", "元入金=100000");
    await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-06-30",
      "--debit",
      "普通預金",
      "--credit",
      "売上",
      "--amount",
      "500000",
      "--description",
      "上期の報酬",
    );

    const early = await run(
      "periods",
      "next",
      id,
      "--out",
      "2027.openkk",
      "--json",
    );
    const earlyResult = JSON.parse(early.stdout) as {
      file: string;
      carriedOver: boolean;
      fiscalPeriod: { id: string; name: string };
    };
    const nextId = earlyResult.fiscalPeriod.id;
    const note = await run("periods", "next", id, "--out", "2027-note.openkk");
    const emptyOpening = await run(
      "--file",
      "2027.openkk",
      "opening",
      "show",
      nextId,
    );
    const tooEarly = await run(
      "--file",
      "2027.openkk",
      "opening",
      "carry",
      nextId,
      "--from",
      DEFAULT_CLI_FILE,
    );

    await run("closing", "pre", id, "--yes");
    await run("closing", "final", id, "--yes");
    await run("periods", "receive", id);

    const carried = await run(
      "--file",
      "2027.openkk",
      "opening",
      "carry",
      nextId,
      "--from",
      DEFAULT_CLI_FILE,
    );
    const carriedOpening = await run(
      "--file",
      "2027.openkk",
      "opening",
      "show",
      nextId,
    );
    const closedNext = await run(
      "periods",
      "next",
      id,
      "--out",
      "2027-closed.openkk",
      "--json",
    );
    const closedResult = JSON.parse(closedNext.stdout) as {
      carriedOver: boolean;
      fiscalPeriod: { openingBalancesCompleted: boolean };
    };
    const missingSource = await run(
      "--file",
      "2027.openkk",
      "opening",
      "carry",
      nextId,
    );

    expect(earlyResult).toMatchObject({
      file: path.join(cwd, "2027.openkk"),
      carriedOver: false,
      fiscalPeriod: { name: "2027年分" },
    });
    expect(note.stdout).toContain("引き継いでいません");
    expect(note.stdout).toContain("opening carry");
    expect(emptyOpening.stdout).toContain("まだ入力されていません");
    expect(tooEarly.code).toBe(1);
    expect(tooEarly.stderr).toContain("本締めと書類の受領");
    expect(carried.code).toBe(0);
    expect(carried.stdout).toContain("引き継ぎました: 2026年分 → 2027年分");
    expect(carriedOpening.stdout).toContain("現金  100,000");
    expect(carriedOpening.stdout).toContain("普通預金  500,000");
    expect(closedResult).toMatchObject({
      carriedOver: true,
      fiscalPeriod: { openingBalancesCompleted: true },
    });
    expect(missingSource.code).toBe(2);
  });

  it("runs a whole year from opening balances to the next period", async () => {
    const { cwd, run } = workspace();
    const id = await startedPeriod(run);
    const unbalanced = await run(
      "opening",
      "set",
      id,
      "現金=100000",
      "元入金=90000",
    );
    const opening = await run(
      "opening",
      "set",
      id,
      "現金=100,000",
      "元入金=100000",
    );
    await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-06-30",
      "--debit",
      "普通預金",
      "--credit",
      "売上",
      "--amount",
      "500000",
      "--description",
      "上期の報酬",
    );
    await run(
      "entries",
      "add",
      id,
      "--date",
      "2026-08-20",
      "--debit",
      "通信費",
      "--credit",
      "普通預金",
      "--amount",
      "8800",
      "--description",
      "回線",
      "--business-rate",
      "50",
    );
    const book = await openCliBook(
      path.join(cwd, DEFAULT_CLI_FILE),
      DEFAULT_CLI_USER_ID,
    );
    await book.backend.fixedAssets.create(id, {
      name: "カメラ",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 5,
      depreciationMethod: "straight_line",
      businessRate: 0.8,
      bookAccountId: "acct_equipment",
    });
    book.close();

    const provisional = await run("report", id, "fs");
    const midPeriod = await run("closing", "pre", id);
    const preClosed = await run("closing", "pre", id, "--yes");
    const unconfirmedFinal = await run("closing", "final", id);
    const finalized = await run("closing", "final", id, "--yes");
    const final = await run("report", id, "fs");
    await run("periods", "receive", id);
    const next = await run("periods", "next", id, "--json");
    const nextPeriod = JSON.parse(next.stdout) as {
      id: string;
      name: string;
      startDate: string;
      openingBalancesCompleted: boolean;
    };
    const nextOpening = await run("opening", "show", nextPeriod.id);

    expect(unbalanced.code).toBe(2);
    expect(opening.stdout).toContain("資産合計 100,000");
    expect(midPeriod.code).toBe(2);
    expect(preClosed.stdout).toContain("仮締め済み");
    expect(unconfirmedFinal.code).toBe(2);
    expect(finalized.code).toBe(0);
    expect(finalized.stdout).toContain("決算後");
    expect(final.stdout).toBe(provisional.stdout);
    expect(nextPeriod).toMatchObject({
      name: "2027年分",
      startDate: "2027-01-01",
      openingBalancesCompleted: true,
    });
    expect(nextOpening.stdout).toContain("工具器具備品");
  });

  it("rejects unknown commands and options as usage errors", async () => {
    const { run } = workspace();

    expect((await run("constructor")).code).toBe(2);
    expect((await run("entries")).code).toBe(2);
    expect((await run("--bogus")).code).toBe(2);
    expect((await run("--help")).stdout).toContain("使い方");
  });
});
