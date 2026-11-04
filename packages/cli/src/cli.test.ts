import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CLI_FILE_ENV, DEFAULT_CLI_FILE, runOpenkkCli } from "./index.js";

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
    });
    return { code, stdout, stderr };
  };
  return { cwd, env, run };
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

  it("rejects unknown commands and options as usage errors", async () => {
    const { run } = workspace();

    expect((await run("entries")).code).toBe(2);
    expect((await run("--bogus")).code).toBe(2);
    expect((await run("--help")).stdout).toContain("使い方");
  });
});
