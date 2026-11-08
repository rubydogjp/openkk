import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { clickButton, expectStep } from "../helpers";

const NEW_BOOK_NAME = "帳簿.openkk";
const tempDirs: string[] = [];

test.afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const PICKED_FOLDER = "picked-folder";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((folderName) => {
    const root = () => navigator.storage.getDirectory();
    const asPickedFile = (handle: FileSystemFileHandle) => ({
      name: handle.name,
      getFile: () => handle.getFile(),
      createWritable: () => handle.createWritable(),
    });
    const pickerWindow = window as unknown as Record<string, unknown>;
    if (sessionStorage.getItem("openkk-test-no-file-access") === "1") {
      pickerWindow.showDirectoryPicker = undefined;
      pickerWindow.showOpenFilePicker = undefined;
      return;
    }
    pickerWindow.showDirectoryPicker = async () =>
      (await root()).getDirectoryHandle(folderName, { create: true });
    pickerWindow.showOpenFilePicker = async () => [
      asPickedFile(
        await (
          await root()
        ).getFileHandle(
          String(sessionStorage.getItem("openkk-test-open-name")),
        ),
      ),
    ];
  }, PICKED_FOLDER);
});

test("keeps the books in the chosen folder and autosaves every change", async ({
  page,
}) => {
  await page.goto("/");
  await clickButton(page, "帳簿を置くフォルダを選ぶ");
  await expect(page.getByText(`フォルダ: ${PICKED_FOLDER}`)).toBeVisible();
  await expect(page.getByText("まだ帳簿はありません")).toBeVisible();

  await clickButton(page, "新しい帳簿を作る");
  await expectBookOpen(page, NEW_BOOK_NAME);
  await addFiscalPeriodInApp(page, "ファイル版の期間");
  await expectSaved(page);

  const savedPath = await saveToTempFile(
    await getFile(page, PICKED_FOLDER, NEW_BOOK_NAME),
    NEW_BOOK_NAME,
  );
  expect(await readCliPeriods(savedPath)).toEqual([
    { name: "ファイル版の期間", phase: "pre_opening" },
  ]);

  await page.reload();
  await expect(page.getByText(`フォルダ: ${PICKED_FOLDER}`)).toBeVisible();
  await openBookFromList(page, NEW_BOOK_NAME);
  await expectStep(page, "期間を開始");
  await expect(page.getByText("ファイル版の期間").first()).toBeVisible();
});

test("opens a book made by the CLI and writes back changes the CLI can read", async ({
  page,
}) => {
  const fileName = "cli.openkk";
  const cliPath = await createCliBook(fileName, "CLIで作った期間");
  await page.goto("/");
  await clickButton(page, "帳簿を置くフォルダを選ぶ");
  await putFile(page, PICKED_FOLDER, fileName, fs.readFileSync(cliPath));
  await page.reload();
  await openBookFromList(page, fileName);
  await expect(page.getByText("CLIで作った期間").first()).toBeVisible();

  await startOpenedPeriod(page);
  await expectSaved(page);
  fs.writeFileSync(
    cliPath,
    Buffer.from(await getFile(page, PICKED_FOLDER, fileName)),
  );

  expect(await readCliPeriods(cliPath)).toEqual([
    { name: "CLIで作った期間", phase: "journalizing" },
  ]);
});

test("opens a book file outside the folder", async ({ page }) => {
  const fileName = "outside.openkk";
  const cliPath = await createCliBook(fileName, "フォルダの外の期間");
  await page.goto("/");
  await clickButton(page, "帳簿を置くフォルダを選ぶ");
  await putFile(page, null, fileName, fs.readFileSync(cliPath));
  await openWithPicker(page, fileName);
  await expectBookOpen(page, fileName);
  await expect(page.getByText("フォルダの外の期間").first()).toBeVisible();
});

test("stops autosaving when another app changes the file", async ({ page }) => {
  const fileName = "shared.openkk";
  const cliPath = await createCliBook(fileName, "共有する期間");
  await page.goto("/");
  await clickButton(page, "帳簿を置くフォルダを選ぶ");
  await putFile(page, PICKED_FOLDER, fileName, fs.readFileSync(cliPath));
  await page.reload();
  await openBookFromList(page, fileName);

  await page.waitForTimeout(50);
  await putFile(page, PICKED_FOLDER, fileName, fs.readFileSync(cliPath));
  await startOpenedPeriod(page);

  await expect(
    page.getByRole("alert").filter({ hasText: "自動保存を止めました" }),
  ).toBeVisible();
  await clickButton(page, "開き直す");
  await expect(
    page.getByRole("button", { name: "新しい帳簿を作る" }),
  ).toBeVisible();
});

test("refuses a file that is not an openkk book", async ({ page }) => {
  await page.goto("/");
  await clickButton(page, "帳簿を置くフォルダを選ぶ");
  await putFile(page, PICKED_FOLDER, "note.openkk", Buffer.from("not a book"));
  await page.reload();
  await openBookFromList(page, "note.openkk");

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "オープン会計の帳簿ではありません" }),
  ).toBeVisible();
});

test("keeps the books inside the app when the browser cannot write files", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    sessionStorage.setItem("openkk-test-no-file-access", "1"),
  );
  await page.reload();
  await expect(page.getByText("アプリの中に保存します")).toBeVisible();

  await clickButton(page, "新しい帳簿を作る");
  await expectBookOpen(page, NEW_BOOK_NAME);
  await addFiscalPeriodInApp(page, "アプリの中の期間");
  await expectSaved(page);

  const cliPath = await createCliBook("imported.openkk", "取り込んだ期間");
  await page.reload();
  await expect(page.getByRole("region", { name: "帳簿" })).toContainText(
    NEW_BOOK_NAME,
  );
  const chooser = page.waitForEvent("filechooser");
  await clickButton(page, "ファイルを取り込む");
  await (await chooser).setFiles(cliPath);
  await expectBookOpen(page, "imported.openkk");
  await expect(page.getByText("取り込んだ期間").first()).toBeVisible();
  await expectSaved(page);

  await page.reload();
  await page.getByRole("button", { name: "imported.openkk を削除" }).click();
  await clickButton(page, "削除する");
  await expect(page.getByRole("region", { name: "帳簿" })).not.toContainText(
    "imported.openkk",
  );
  await openBookFromList(page, NEW_BOOK_NAME);
  await expect(page.getByText("アプリの中の期間").first()).toBeVisible();
});

test("starts the next period in a new book next to the closed one", async ({
  page,
}) => {
  const fileName = "2026年分.openkk";
  const closedPath = await createClosedCliBook(fileName);
  await page.goto("/");
  await clickButton(page, "帳簿を置くフォルダを選ぶ");
  await putFile(page, PICKED_FOLDER, fileName, fs.readFileSync(closedPath));
  await page.reload();
  await openBookFromList(page, fileName);
  await expectStep(page, "次の期間へ");
  await expect(page.getByText("2027年分.openkk (新しい帳簿)")).toBeVisible();
  const reversal = page.getByRole("checkbox", { name: /年末の未払い/ });
  await reversal.locator("..").click();
  await expect(reversal).toBeChecked();

  await clickButton(page, "次期を作成");
  await expectBookOpen(page, "2027年分.openkk");
  await expectStep(page, "期間を開始");
  await expectSaved(page);

  const nextPath = await saveToTempFile(
    await getFile(page, PICKED_FOLDER, "2027年分.openkk"),
    "2027年分.openkk",
  );
  expect(await readCliOpenings(nextPath)).toEqual([
    {
      name: "2027年分",
      phase: "pre_opening",
      balanceAccounts: expect.arrayContaining(["l:未払金"]),
      journals: ["再振替: 年末の未払い"],
    },
  ]);
  expect(await readCliPeriods(closedPath)).toEqual([
    { name: "2026年分", phase: "post_closing" },
  ]);
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

async function startOpenedPeriod(page: Page) {
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "期首のBSを入力");
}

async function openBookFromList(page: Page, fileName: string) {
  await page
    .getByRole("region", { name: "帳簿" })
    .getByRole("button", { name: fileName })
    .first()
    .click();
}

async function openWithPicker(page: Page, fileName: string) {
  await page.evaluate(
    (name) => sessionStorage.setItem("openkk-test-open-name", name),
    fileName,
  );
  await clickButton(page, "ファイルを開く");
}

async function bookDirectory(page: Page, folder: string | null) {
  return page.evaluateHandle(async (name) => {
    const root = await navigator.storage.getDirectory();
    return name == null
      ? root
      : root.getDirectoryHandle(name, { create: true });
  }, folder);
}

async function putFile(
  page: Page,
  folder: string | null,
  fileName: string,
  bytes: Buffer,
) {
  const directory = await bookDirectory(page, folder);
  await directory.evaluate(
    async (handle, { name, data }) => {
      const file = await handle.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(new Uint8Array(data));
      await writable.close();
    },
    { name: fileName, data: [...bytes] },
  );
}

async function getFile(
  page: Page,
  folder: string | null,
  fileName: string,
): Promise<number[]> {
  const directory = await bookDirectory(page, folder);
  return directory.evaluate(async (handle, name) => {
    const file = await (await handle.getFileHandle(name)).getFile();
    return [...new Uint8Array(await file.arrayBuffer())];
  }, fileName);
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-file-e2e-"));
  tempDirs.push(dir);
  return dir;
}

async function saveToTempFile(bytes: number[], fileName: string) {
  const filePath = path.join(makeTempDir(), fileName);
  fs.writeFileSync(filePath, Buffer.from(bytes));
  return filePath;
}

async function createCliBook(fileName: string, periodName: string) {
  const { createNodeSqliteDbAdapter } =
    await import("@rubydogjp/openkk-node-sqlite-db-adapter");
  const filePath = path.join(makeTempDir(), fileName);
  const adapter = await createNodeSqliteDbAdapter(filePath, null);
  await adapter.db.fiscalPeriods.create("openkk-original-user", {
    name: periodName,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  adapter.close();
  return filePath;
}

async function createClosedCliBook(fileName: string) {
  const { createNodeSqliteDbAdapter } =
    await import("@rubydogjp/openkk-node-sqlite-db-adapter");
  const { buildExpectedClosingEntries, createOpenkkServer } =
    await import("@rubydogjp/openkk-server");
  const filePath = path.join(makeTempDir(), fileName);
  const adapter = await createNodeSqliteDbAdapter(filePath, null);
  try {
    const server = createOpenkkServer(adapter.db, {
      userId: "openkk-original-user",
    });
    const period = await server.fiscalPeriods.create({
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await server.fiscalPeriods.start(period.id);
    await server.fiscalPeriods.patch(period.id, {
      openingBalancesCompleted: true,
    });
    await adapter.db.entries.create(period.userId, period.id, {
      date: period.endDate,
      description: "年末の未払い",
      localId: null,
      businessRate: 1,
      lines: [
        { side: "debit" as const, bookAccountId: "acct_supplies" },
        { side: "credit" as const, bookAccountId: "acct_accrued_expense" },
      ].map((line) => ({
        ...line,
        amount: 1000,
        partnerName: "",
        taxCategoryId: "",
        businessCategoryId: "",
      })),
    });
    await server.preClosings.run(period.id);
    await server.closings.run(
      period.id,
      buildExpectedClosingEntries({
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        entries: await server.entries.getAll(period.id),
        fixedAssets: [],
        openingJournals: [],
        bookAccounts: await server.masterData.getBookAccounts(),
      }),
    );
    await server.fiscalPeriods.patch(period.id, {
      documentsReceivedCompleted: true,
    });
  } finally {
    adapter.close();
  }
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

async function readCliOpenings(filePath: string) {
  const { createNodeSqliteDbAdapter } =
    await import("@rubydogjp/openkk-node-sqlite-db-adapter");
  const adapter = await createNodeSqliteDbAdapter(filePath, null);
  try {
    return (await adapter.db.fiscalPeriods.getAll("openkk-original-user")).map(
      ({ name, phase, opening }) => ({
        name,
        phase,
        balanceAccounts: opening.balanceLines.map((line) => line.accountId),
        journals: opening.journals.map((journal) => journal.description),
      }),
    );
  } finally {
    adapter.close();
  }
}
