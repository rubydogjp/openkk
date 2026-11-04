import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { clickButton, expectStep } from "../helpers";

const NEW_BOOK_NAME = "帳簿.openkk";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const root = () => navigator.storage.getDirectory();
    const asPickedFile = (handle: FileSystemFileHandle) => ({
      name: handle.name,
      getFile: () => handle.getFile(),
      createWritable: () => handle.createWritable(),
    });
    const pickerWindow = window as unknown as Record<string, unknown>;
    pickerWindow.showSaveFilePicker = async (options: {
      suggestedName: string;
    }) =>
      asPickedFile(
        await (
          await root()
        ).getFileHandle(options.suggestedName, { create: true }),
      );
    pickerWindow.showOpenFilePicker = async () => [
      asPickedFile(
        await (
          await root()
        ).getFileHandle(
          String(sessionStorage.getItem("openkk-test-open-name")),
        ),
      ),
    ];
  });
});

test("creates a book file and autosaves every change to it", async ({
  page,
}) => {
  await page.goto("/");
  await clickButton(page, "新しい帳簿を作る");
  await expectBookOpen(page, NEW_BOOK_NAME);
  await addFiscalPeriodInApp(page, "ファイル版の期間");
  await expectSaved(page);

  const savedPath = await saveToTempFile(
    await getFile(page, NEW_BOOK_NAME),
    NEW_BOOK_NAME,
  );
  expect(await readCliPeriods(savedPath)).toEqual([
    { name: "ファイル版の期間", phase: "pre_opening" },
  ]);
});

test("opens a book made by the CLI and writes back changes the CLI can read", async ({
  page,
}) => {
  const fileName = "cli.openkk";
  const cliPath = await createCliBook(fileName, "CLIで作った期間");
  await page.goto("/");
  await putFile(page, fileName, fs.readFileSync(cliPath));
  await openWithPicker(page, fileName);
  await expectBookOpen(page, fileName);
  await expect(page.getByText("CLIで作った期間")).toBeVisible();

  await startPeriodFromList(page, "CLIで作った期間");
  await expectSaved(page);
  fs.writeFileSync(cliPath, Buffer.from(await getFile(page, fileName)));

  expect(await readCliPeriods(cliPath)).toEqual([
    { name: "CLIで作った期間", phase: "journalizing" },
  ]);
});

test("stops autosaving when another app changes the file", async ({ page }) => {
  const fileName = "shared.openkk";
  const cliPath = await createCliBook(fileName, "共有する期間");
  await page.goto("/");
  await putFile(page, fileName, fs.readFileSync(cliPath));
  await openWithPicker(page, fileName);
  await expectBookOpen(page, fileName);

  await page.waitForTimeout(50);
  await putFile(page, fileName, fs.readFileSync(cliPath));
  await startPeriodFromList(page, "共有する期間");

  await expect(
    page.getByRole("alert").filter({ hasText: "自動保存を止めました" }),
  ).toBeVisible();
  await clickButton(page, "開き直す");
  await expect(
    page.getByRole("button", { name: "ファイルを開く" }),
  ).toBeVisible();
});

test("refuses a file that is not an openkk book", async ({ page }) => {
  await page.goto("/");
  await putFile(page, "note.openkk", Buffer.from("not a book"));
  await openWithPicker(page, "note.openkk");

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "オープン会計の帳簿ではありません" }),
  ).toBeVisible();
});

async function expectBookOpen(page: Page, fileName: string) {
  await expect(
    page.getByRole("button", { name: "アカウントメニュー" }),
  ).toContainText(fileName, { timeout: 15_000 });
}

async function expectSaved(page: Page) {
  await expect(
    page.getByRole("button", { name: "アカウントメニュー" }),
  ).toContainText("保存済み");
}

async function addFiscalPeriodInApp(page: Page, name: string) {
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
  await page.getByRole("button", { name: "追加" }).click();
  await page.getByPlaceholder("例: 2026年分").fill(name);
  await clickButton(page, "作成する");
  await expectStep(page, "期間を開始");
}

async function startPeriodFromList(page: Page, name: string) {
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
  await page.getByText(name).click();
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "期首のBSを入力");
}

async function openWithPicker(page: Page, fileName: string) {
  await page.evaluate(
    (name) => sessionStorage.setItem("openkk-test-open-name", name),
    fileName,
  );
  await clickButton(page, "ファイルを開く");
}

async function putFile(page: Page, fileName: string, bytes: Buffer) {
  await page.evaluate(
    async ({ name, data }) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(data));
      await writable.close();
    },
    { name: fileName, data: [...bytes] },
  );
}

async function getFile(page: Page, fileName: string): Promise<number[]> {
  return page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(name)).getFile();
    return [...new Uint8Array(await file.arrayBuffer())];
  }, fileName);
}

async function saveToTempFile(bytes: number[], fileName: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-file-e2e-"));
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, Buffer.from(bytes));
  return filePath;
}

async function createCliBook(fileName: string, periodName: string) {
  const { createNodeSqliteDbAdapter } =
    await import("@rubydogjp/openkk-node-sqlite-db-adapter");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-file-e2e-"));
  const filePath = path.join(dir, fileName);
  const adapter = await createNodeSqliteDbAdapter(filePath, null);
  await adapter.db.fiscalPeriods.create("openkk-original-user", {
    name: periodName,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  adapter.close();
  return filePath;
}

async function readCliPeriods(
  filePath: string,
): Promise<Array<{ name: string; phase: string }>> {
  const { createNodeSqliteDbAdapter } =
    await import("@rubydogjp/openkk-node-sqlite-db-adapter");
  const adapter = await createNodeSqliteDbAdapter(filePath, null);
  try {
    return (await adapter.db.fiscalPeriods.getAll("openkk-original-user")).map(
      ({ name, phase }) => ({ name, phase }),
    );
  } finally {
    adapter.close();
  }
}
