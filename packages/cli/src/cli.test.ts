import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openCliBackend } from "./backend.js";
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
    await run("entries", "import", id, "journal.csv");
    const reimported = await run("entries", "import", id, "journal.csv");

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
    expect(reimported.stdout).toContain("取込 0 件 / 重複スキップ 1 件");
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
    const backend = await openCliBackend(
      path.join(cwd, DEFAULT_CLI_FILE),
      DEFAULT_CLI_USER_ID,
    );
    await backend.api.fixedAssets.create(id, {
      name: "ノートパソコン",
      acquisitionDate: "2026-01-10",
      acquisitionCost: 240000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });
    backend.close();

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

  it("rejects unknown commands and options as usage errors", async () => {
    const { run } = workspace();

    expect((await run("constructor")).code).toBe(2);
    expect((await run("entries")).code).toBe(2);
    expect((await run("--bogus")).code).toBe(2);
    expect((await run("--help")).stdout).toContain("使い方");
  });
});
